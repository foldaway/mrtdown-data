import {
  derivePlatformGroup,
  groupedPlatformDiagnosticsAllow,
} from './groupedPlatforms.js';
import {
  GroupedScopedReconciliationDraftSchema,
  groupedScopedReviewDraftSha256,
} from './groupedReviewContract.js';
import { compareStrings } from './order.js';
import {
  evaluateGroupedScopedReconciliation,
  evaluateScopedReconciliation,
} from './scopedReview.js';
import {
  derive,
  operatorMatchesDate,
  targetOnDate,
} from './scopedReviewContext.js';
import {
  fingerprint,
  key,
  ScopedReconciliationDraftSchema,
  type ScopedReviewContext,
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';
import { resolveStationCandidates } from './stationMatch.js';

/** Explain unresolved claims, without choosing dispositions or repairing either input. */
export function buildScopedReviewBlockers(
  context: ScopedReviewContext,
  input: unknown,
) {
  const parsed = GroupedScopedReconciliationDraftSchema.safeParse(input);
  const draft = parsed.success
    ? parsed.data
    : ScopedReconciliationDraftSchema.parse(input);
  const grouped = draft.schemaVersion === 3;
  const evaluation = grouped
    ? evaluateGroupedScopedReconciliation(context, draft)
    : evaluateScopedReconciliation(context, draft);
  if (!evaluation.valid)
    throw new Error(`Invalid mapping draft: ${evaluation.errors.join('; ')}`);
  const { report, evidence, audit } = derive(context);
  const entries = new Map(report.entries.map((entry) => [key(entry), entry]));
  const decisions = new Map(
    draft.decisions
      .filter((item) => item.kind !== 'pattern')
      .map((item) => [key(item), item]),
  );
  const dateSets = new Map(
    draft.dateSets.map((set) => [set.id, set.serviceDates]),
  );
  const stops = new Map(
    (context.tables['stops.txt'] ?? []).map((row) => [row.stop_id, row]),
  );
  const groups = new Map(
    draft.decisions.flatMap((item) =>
      item.kind === 'stop' &&
      item.disposition === 'matched' &&
      item.target?.kind === 'platformGroup'
        ? [[item.providerId, item.target] as const]
        : [],
    ),
  );
  const selected = new Set(draft.pilotLineIds);
  const targetId = (sourceKey: string) => {
    const item = decisions.get(sourceKey);
    return item?.disposition === 'matched' && item.target && 'id' in item.target
      ? item.target.id
      : undefined;
  };
  const dependency = (kind: string, providerId: string) => ({
    kind,
    providerId,
    disposition:
      decisions.get(`${kind}:${providerId}`)?.disposition ?? 'missing',
  });
  const stopDependencies = (ids: string[]) => {
    const result = new Map<string, ReturnType<typeof dependency>>();
    for (const id of ids) {
      let next: string | undefined = id;
      while (next && !result.has(`stop:${next}`)) {
        result.set(`stop:${next}`, dependency('stop', next));
        next = stops.get(next)?.parent_station;
      }
    }
    return [...result.values()];
  };
  const unmatched = (items: ReturnType<typeof dependency>[]) =>
    items
      .filter((item) => item.disposition !== 'matched')
      .sort((a, b) => compareStrings(key(a), key(b)));
  const orderTargets = <T>(items: T[]) =>
    [...items].sort((a, b) => compareStrings(fingerprint(a), fingerprint(b)));
  const pilotRoutes = new Set(
    report.entries
      .filter(
        (entry) =>
          entry.kind === 'route' &&
          entry.candidates.length === 1 &&
          selected.has(entry.candidates[0]?.id ?? ''),
      )
      .map((entry) => entry.providerId),
  );
  const pilotStops = new Set(
    stopDependencies(
      audit.patterns
        .filter((pattern) => pilotRoutes.has(pattern.routeId))
        .flatMap((pattern) => pattern.stopIds),
    ).map((item) => item.providerId),
  );
  const pilotAgencies = new Set(
    audit.routes
      .filter((route) => pilotRoutes.has(route.route_id ?? ''))
      .map((route) => route.agency_id),
  );
  const inPilot = (item: { kind: string; providerId: string }) =>
    item.kind === 'agency'
      ? pilotAgencies.has(item.providerId)
      : item.kind === 'route'
        ? pilotRoutes.has(item.providerId)
        : pilotStops.has(item.providerId);
  const entities = draft.decisions
    .filter(
      (item) => item.kind !== 'pattern' && item.disposition === 'unresolved',
    )
    .map((item) => {
      const source = entries.get(key(item));
      if (!source) throw new Error('Missing source entry');
      const row = item.kind === 'stop' ? stops.get(item.providerId) : undefined;
      const route =
        item.kind === 'route'
          ? audit.routes.find((row) => row.route_id === item.providerId)
          : undefined;
      const dependencies = unmatched(
        row?.parent_station
          ? stopDependencies([row.parent_station])
          : route?.agency_id
            ? [dependency('agency', route.agency_id)]
            : [],
      );
      const labels = row?.platform_code
        ? row.platform_code.split('/').map((label) => label.trim())
        : [];
      const platformEvidence =
        row && (!row.location_type || row.location_type === '0')
          ? {
              stopCode: row.stop_code ?? null,
              parentStation: row.parent_station ?? null,
              platformCode: row.platform_code ?? null,
              literalLabels: labels,
              labelsWellFormed:
                labels.every(Boolean) && new Set(labels).size === labels.length,
              completeGroup:
                derivePlatformGroup(context, item.providerId) ?? null,
              stationCandidates: resolveStationCandidates(
                row,
                row.parent_station ? stops.get(row.parent_station) : undefined,
                context.topology.stations,
              )
                .map(({ station }) => {
                  const lineIds = [
                    ...new Set(
                      station.stationCodes
                        .filter((code) => code.code === row.stop_code)
                        .map((code) => code.lineId),
                    ),
                  ].sort(compareStrings);
                  return {
                    stationId: station.id,
                    lineIds,
                    members: labels.map((label) => ({
                      label,
                      platformIds: station.platforms
                        .filter(
                          (platform) =>
                            lineIds.includes(platform.lineId) &&
                            platform.label === label,
                        )
                        .map((platform) => platform.id)
                        .sort(compareStrings),
                    })),
                  };
                })
                .sort((a, b) => compareStrings(a.stationId, b.stationId)),
            }
          : undefined;
      const codes: string[] = [];
      if (!inPilot(item)) codes.push('outside-pilot');
      if (
        item.kind === 'agency' &&
        !audit.routes.some((route) => route.agency_id === item.providerId)
      )
        codes.push('unused-agency');
      if (!source.candidates.length) codes.push('no-entity-candidate');
      if (source.candidates.length > 1) codes.push('ambiguous-entity');
      if (dependencies.length) codes.push('unmatched-dependency');
      if (platformEvidence && labels.length > 1)
        codes.push(
          platformEvidence.completeGroup
            ? grouped
              ? 'review-required'
              : 'platform-group-requires-v3'
            : 'incomplete-or-ambiguous-platform-group',
        );
      if (platformEvidence && !platformEvidence.labelsWellFormed)
        codes.push('malformed-platform-label');
      if (!codes.length) codes.push('review-required');
      return {
        kind: item.kind,
        providerId: item.providerId,
        sourceRecordSha256: item.sourceRecordSha256,
        reason: item.reason,
        codes: codes.sort(compareStrings),
        candidates: orderTargets(source.candidates),
        unmatchedDependencies: dependencies,
        ...(platformEvidence ? { platformEvidence } : {}),
      };
    })
    .sort((a, b) => compareStrings(key(a), key(b)));

  const patterns = draft.decisions
    .flatMap((item) => {
      if (item.kind !== 'pattern' || item.disposition !== 'unresolved')
        return [];
      const facts = evidence.patterns.find(
        (pattern) => pattern.providerId === item.providerId,
      );
      const pattern = audit.patterns.find(
        (pattern) => pattern.id === item.providerId,
      );
      if (!facts || !pattern) throw new Error('Missing source pattern');
      const route = audit.routes.find((row) => row.route_id === facts.routeId);
      const dependencies = unmatched([
        dependency('route', facts.routeId),
        ...(route?.agency_id ? [dependency('agency', route.agency_id)] : []),
        ...stopDependencies(facts.stopIds),
      ]);
      const routeId = targetId(`route:${facts.routeId}`);
      const agencyId = targetId(`agency:${route?.agency_id}`);
      const scopes = new Map<
        string,
        {
          serviceDates: string[];
          codes: string[];
          temporalStatus: string;
          candidates: {
            target: (typeof facts.candidates)[number]['target'];
            currentPlatformDiagnosticsPass: boolean;
            groupedMemberDiagnosticsPass: boolean;
            operatorPeriodMatches: boolean | null;
          }[];
        }
      >();
      const staticCodes: string[] = [];
      if (!facts.candidates.length) staticCodes.push('no-path-candidate');
      if (dependencies.length) staticCodes.push('unmatched-dependency');
      if (!pilotRoutes.has(facts.routeId)) staticCodes.push('outside-pilot');
      for (const date of dateSets.get(item.dateSetId) ?? []) {
        const temporal = facts.dateScopes.scopes.find((scope) =>
          scope.serviceDates.includes(date),
        );
        if (!temporal) throw new Error('Missing exact date evidence');
        const operatorPeriodMatches =
          routeId && agencyId
            ? operatorMatchesDate(context.topology, routeId, agencyId, date)
            : null;
        const candidates = orderTargets(
          temporal.candidates.map((target) => ({
            target,
            currentPlatformDiagnosticsPass: targetOnDate(
              facts.platformDiagnosticScopes,
              date,
              target,
            ),
            groupedMemberDiagnosticsPass:
              !grouped ||
              groupedPlatformDiagnosticsAllow(facts, target, groups),
            operatorPeriodMatches,
          })),
        );
        const codes = [...staticCodes];
        if (temporal.status === 'gap') codes.push('temporal-gap');
        if (temporal.status === 'ambiguous') codes.push('temporal-ambiguity');
        if (
          candidates.some(
            (candidate) => !candidate.currentPlatformDiagnosticsPass,
          )
        )
          codes.push('current-platform-diagnostics');
        if (
          candidates.some(
            (candidate) => !candidate.groupedMemberDiagnosticsPass,
          )
        )
          codes.push('group-member-diagnostics');
        if (operatorPeriodMatches === false) codes.push('operator-period');
        if (!codes.length) codes.push('review-required');
        const details = {
          codes: codes.sort(compareStrings),
          temporalStatus: temporal.status,
          candidates,
        };
        const scopeKey = fingerprint(details);
        const scope = scopes.get(scopeKey) ?? { ...details, serviceDates: [] };
        scope.serviceDates.push(date);
        scopes.set(scopeKey, scope);
      }
      if (!scopes.size)
        scopes.set('inactive', {
          serviceDates: [],
          codes: [
            ...staticCodes,
            facts.activeDates.count
              ? 'empty-cell-review-required'
              : 'empty-calendar-review-required',
          ].sort(compareStrings),
          temporalStatus: facts.activeDates.count ? 'unclaimed' : 'inactive',
          candidates: [],
        });
      return [
        {
          providerId: item.providerId,
          sourceRecordSha256: item.sourceRecordSha256,
          dateSetId: item.dateSetId,
          reason: item.reason,
          routeId: facts.routeId,
          calendarId: facts.calendarId,
          tripCount: facts.tripCount,
          tripIds: [...pattern.tripIds].sort(compareStrings),
          stopIds: facts.stopIds,
          unmatchedDependencies: dependencies,
          dateScopes: [...scopes.values()]
            .map((scope) => ({
              ...scope,
              serviceDates: scope.serviceDates.sort(compareStrings),
              dateSetId: scopedReviewDateSetId(scope.serviceDates),
            }))
            .sort((a, b) => compareStrings(a.dateSetId, b.dateSetId)),
          candidateEvidence: orderTargets(
            facts.candidates.map((candidate) => ({
              ...candidate,
              occurrences: candidate.occurrences.map((occurrence) => ({
                ...occurrence,
                role:
                  facts.stopIds.length === 1
                    ? 'initial-and-final'
                    : occurrence.index === 0
                      ? 'initial'
                      : occurrence.index === facts.stopIds.length - 1
                        ? 'final'
                        : 'intermediate',
                ...(groups.has(occurrence.stopId)
                  ? { representedGroup: groups.get(occurrence.stopId) }
                  : {}),
                platforms: [...occurrence.platforms].sort((a, b) =>
                  compareStrings(a.platformId, b.platformId),
                ),
              })),
            })),
          ),
        },
      ];
    })
    .sort((a, b) =>
      compareStrings(
        `${a.providerId}:${a.dateSetId}`,
        `${b.providerId}:${b.dateSetId}`,
      ),
    );
  const totals = new Map<
    string,
    { entityCount: number; patternCellCount: number; patternDateCount: number }
  >();
  for (const item of entities)
    for (const code of item.codes) {
      const total = totals.get(code) ?? {
        entityCount: 0,
        patternCellCount: 0,
        patternDateCount: 0,
      };
      total.entityCount++;
      totals.set(code, total);
    }
  for (const item of patterns) {
    const codes = new Set(item.dateScopes.flatMap((scope) => scope.codes));
    for (const code of codes) {
      const total = totals.get(code) ?? {
        entityCount: 0,
        patternCellCount: 0,
        patternDateCount: 0,
      };
      total.patternCellCount++;
      total.patternDateCount += item.dateScopes
        .filter((scope) => scope.codes.includes(code))
        .reduce((count, scope) => count + scope.serviceDates.length, 0);
      totals.set(code, total);
    }
  }
  return {
    schemaVersion: 1 as const,
    documentKind: 'gtfs-scoped-review-blockers' as const,
    identity: report.identity,
    draftSchemaVersion: draft.schemaVersion,
    draftSha256: grouped
      ? groupedScopedReviewDraftSha256(draft)
      : scopedReviewDraftSha256(draft),
    diagnosticBasis:
      'Overlapping investigation causes, not proposed resolutions. Current undated platform diagnostics do not prove historical allocation. Missing claims are reported separately from unresolved decisions.',
    coverageComplete: evaluation.coverageComplete,
    missingEntries: evaluation.missingEntries,
    missingPatternDates: evaluation.missingPatternDates,
    unresolvedDecisionCount: evaluation.unresolvedDecisions,
    unresolvedPatternDateCount: evaluation.unresolvedPatternDates,
    countsByCode: Object.fromEntries(
      [...totals].sort(([a], [b]) => compareStrings(a, b)),
    ),
    entities,
    patterns,
    mappingReviewEligible: false as const,
    generationEligible: false as const,
  };
}
