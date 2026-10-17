import {
  derivePlatformGroup,
  groupedPlatformDiagnosticsAllow,
  type PlatformGroupTarget,
} from './groupedPlatforms.js';
import {
  GroupedScopedReconciliationDraftSchema,
  type GroupedScopedReviewDecision,
} from './groupedReviewContract.js';
import { compareStrings } from './order.js';
import type { ReconciliationTarget } from './reconciliation.js';
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
} from './scopedReviewContract.js';

/** Prepare concrete unique proposals only inside the pilot. Never approve or auto-exclude. */
export function createScopedReconciliationDraft(
  context: ScopedReviewContext,
  options: { pilotLineIds: string[]; preparedBy: string },
) {
  return ScopedReconciliationDraftSchema.parse(
    prepareDraft(context, options, false),
  );
}

/** Version 3 preserves complete platform alternatives without allocating a member. */
export function createGroupedScopedReconciliationDraft(
  context: ScopedReviewContext,
  options: { pilotLineIds: string[]; preparedBy: string },
) {
  return GroupedScopedReconciliationDraftSchema.parse(
    prepareDraft(context, options, true),
  );
}

function prepareDraft(
  context: ScopedReviewContext,
  options: { pilotLineIds: string[]; preparedBy: string },
  allowGroups: boolean,
) {
  const { report, evidence, audit } = derive(context);
  const selected = new Set(options.pilotLineIds);
  for (const id of selected)
    if (!context.topology.lines.some((line) => line.id === id))
      throw new Error(`Unknown pilot line: ${id}`);
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
  const pilotPatterns = audit.patterns.filter((pattern) =>
    pilotRoutes.has(pattern.routeId),
  );
  const pilotStops = new Set(
    pilotPatterns.flatMap((pattern) => pattern.stopIds),
  );
  const stops = new Map(
    (context.tables['stops.txt'] ?? []).map((row) => [row.stop_id, row]),
  );
  for (const id of [...pilotStops]) {
    let parent = stops.get(id)?.parent_station;
    const visited = new Set([id]);
    while (parent && !visited.has(parent)) {
      pilotStops.add(parent);
      visited.add(parent);
      parent = stops.get(parent)?.parent_station;
    }
  }
  const pilotAgencies = new Set(
    audit.routes
      .filter((route) => pilotRoutes.has(route.route_id ?? ''))
      .map((route) => route.agency_id),
  );
  const entities = new Map(
    report.entries
      .filter((entry) => entry.kind !== 'pattern')
      .map((entry) => [key(entry), entry]),
  );
  const inPilot = (entry: { kind: string; providerId: string }) =>
    entry.kind === 'agency'
      ? pilotAgencies.has(entry.providerId)
      : entry.kind === 'route'
        ? pilotRoutes.has(entry.providerId)
        : pilotStops.has(entry.providerId);
  const resolved = new Map<
    string,
    ReconciliationTarget | PlatformGroupTarget | undefined
  >();
  const platformGroups = new Map<string, PlatformGroupTarget>();
  const resolveEntity = (
    sourceKey: string,
    ancestors = new Set<string>(),
  ): ReconciliationTarget | PlatformGroupTarget | undefined => {
    if (resolved.has(sourceKey)) return resolved.get(sourceKey);
    if (ancestors.has(sourceKey)) return undefined;
    const entry = entities.get(sourceKey);
    if (!entry || !inPilot(entry)) return undefined;
    const group =
      allowGroups && entry.kind === 'stop'
        ? derivePlatformGroup(context, entry.providerId)
        : undefined;
    const candidate =
      group ??
      (entry.candidates.length === 1 ? entry.candidates[0] : undefined);
    if (!candidate) return undefined;
    const visited = new Set([...ancestors, sourceKey]);
    if (entry.kind === 'route') {
      const agencyId = audit.routes.find(
        (route) => route.route_id === entry.providerId,
      )?.agency_id;
      if (!agencyId || !resolveEntity(`agency:${agencyId}`, visited))
        return undefined;
    }
    if (entry.kind === 'stop') {
      const row = stops.get(entry.providerId);
      if (allowGroups && !group && row?.platform_code?.includes('/'))
        return undefined;
      if (
        !group &&
        row?.location_type !== '1' &&
        new Set(
          (row?.platform_code ?? '')
            .split('/')
            .map((label) => label.trim())
            .filter(Boolean),
        ).size !== 1
      )
        return undefined;
      if (row?.parent_station) {
        const parent = resolveEntity(`stop:${row.parent_station}`, visited);
        const stationId =
          candidate.kind === 'platformGroup'
            ? candidate.stationId
            : (candidate.stationId ?? candidate.id);
        if (parent?.kind !== 'station' || parent.id !== stationId)
          return undefined;
      }
    }
    resolved.set(sourceKey, candidate);
    if (candidate.kind === 'platformGroup')
      platformGroups.set(entry.providerId, candidate);
    return candidate;
  };
  const entityId = (sourceKey: string) => {
    const target = resolveEntity(sourceKey);
    return target && 'id' in target ? target.id : undefined;
  };
  const decisions: GroupedScopedReviewDecision[] = [];
  const dateSets = new Map<string, string[]>();
  const dateSet = (dates: string[]) => {
    const sorted = [...dates].sort(compareStrings);
    const id = scopedReviewDateSetId(sorted);
    dateSets.set(id, sorted);
    return id;
  };
  const kindOrder = ['agency', 'route', 'stop', 'pattern'];
  const orderedEntries = [...report.entries].sort(
    (a, b) =>
      kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) ||
      compareStrings(a.providerId, b.providerId),
  );
  for (const entry of orderedEntries) {
    const base = {
      kind: entry.kind,
      providerId: entry.providerId,
      sourceRecordSha256: entry.sourceRecordSha256,
    };
    if (entry.kind !== 'pattern') {
      const candidate = resolveEntity(key(entry));
      const candidateId =
        candidate && 'id' in candidate ? candidate.id : undefined;
      const match = Boolean(candidate);
      const row =
        entry.kind === 'stop' ? stops.get(entry.providerId) : undefined;
      const matchedReason =
        entry.kind === 'agency'
          ? `Provider agency ${entry.providerId} has the explicit canonical alias ${candidateId}; selected pilot routes reference it. Proposal pending repository review.`
          : entry.kind === 'route'
            ? `Provider route ${entry.providerId} has the explicit canonical line family ${candidateId}. This does not assign trip direction or endpoints. Proposal pending repository review.`
            : candidate?.kind === 'platformGroup'
              ? `Complete literal source platform group ${row?.platform_code} identifies alternatives ${candidate.platformIds.join(', ')} at ${candidate.stationId}. No individual platform allocation is proposed. Every member requires current service and boarding checks on matched pattern cells. Proposal pending repository review.`
              : row?.location_type === '1'
                ? `Source station code ${row.stop_code || row.stop_id} identifies canonical station ${candidateId}. Parent consistency is preserved; service-date validity is checked on pattern cells. Proposal pending repository review.`
                : `Explicit source platform label ${row?.platform_code} with code ${row?.stop_code} and parent ${row?.parent_station} identifies ${candidateId}. The provider stop-ID suffix is not allocation evidence. Proposal pending repository review.`;
      decisions.push({
        ...base,
        kind: entry.kind,
        disposition: match ? 'matched' : 'unresolved',
        ...(match ? { target: candidate } : {}),
        reason: match
          ? matchedReason
          : inPilot(entry)
            ? 'Pilot identity or platform allocation remains unresolved.'
            : 'Outside the proposal pilot; explicit disposition remains unresolved, with no exclusion inferred.',
      });
      continue;
    }
    const facts = evidence.patterns.find(
      (pattern) => pattern.providerId === entry.providerId,
    );
    if (!facts) throw new Error('Missing pattern evidence');
    const dates = facts.dateScopes.scopes
      .flatMap((scope) => scope.serviceDates)
      .sort(compareStrings);
    if (!pilotRoutes.has(facts.routeId)) {
      decisions.push({
        ...base,
        kind: 'pattern',
        dateSetId: dateSet(dates),
        disposition: 'unresolved',
        reason:
          'Outside the proposal pilot; all actual active dates remain unresolved, not excluded.',
      });
      continue;
    }
    if (!dates.length) {
      decisions.push({
        ...base,
        kind: 'pattern',
        dateSetId: dateSet([]),
        disposition: 'inactive',
        reason:
          'Source calendar has no active service dates; no matched service coverage is proposed.',
      });
      continue;
    }
    const groups = new Map<
      string,
      { target?: ReconciliationTarget; dates: string[]; reason: string }
    >();
    for (const scope of facts.dateScopes.scopes)
      for (const date of scope.serviceDates) {
        const candidate =
          scope.candidates.length === 1 ? scope.candidates[0] : undefined;
        const dependenciesResolved =
          decisions.some(
            (item) =>
              item.kind === 'route' &&
              item.providerId === facts.routeId &&
              item.disposition === 'matched',
          ) &&
          facts.stopIds.every((id) =>
            decisions.some(
              (item) =>
                item.kind === 'stop' &&
                item.providerId === id &&
                item.disposition === 'matched',
            ),
          );
        const match =
          candidate &&
          dependenciesResolved &&
          operatorMatchesDate(
            context.topology,
            entityId(`route:${facts.routeId}`),
            entityId(
              `agency:${audit.routes.find((route) => route.route_id === facts.routeId)?.agency_id}`,
            ),
            date,
          ) &&
          targetOnDate(facts.platformDiagnosticScopes, date, candidate) &&
          (!allowGroups ||
            groupedPlatformDiagnosticsAllow(facts, candidate, platformGroups))
            ? candidate
            : undefined;
        const reason = match
          ? `Ordered source path ${facts.stopIds[0]} to ${facts.stopIds.at(-1)} (${facts.stopIds.length} occurrences) is a ${match.match} match of ${match.id}/${match.revisionId} on these exact active dates. Source endpoints, short workings and occurrence rules are preserved. Current platform diagnostics have no explicit conflict; final semantics require repository review.`
          : 'Temporal ambiguity/gap, unresolved identity or current platform diagnostic remains; no latest revision or exclusion is inferred.';
        const groupKey = fingerprint(match ?? null);
        const group = groups.get(groupKey) ?? {
          ...(match ? { target: match } : {}),
          dates: [],
          reason,
        };
        group.dates.push(date);
        groups.set(groupKey, group);
      }
    for (const group of groups.values())
      decisions.push({
        ...base,
        kind: 'pattern',
        dateSetId: dateSet(group.dates),
        disposition: group.target ? 'matched' : 'unresolved',
        ...(group.target ? { target: group.target } : {}),
        reason: group.reason,
      });
  }
  return {
    schemaVersion: allowGroups ? 3 : 2,
    documentKind: 'gtfs-scoped-mapping-draft',
    identity: report.identity,
    preparedBy: options.preparedBy,
    pilotLineIds: [...selected].sort(compareStrings),
    dateSets: [...dateSets]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([id, serviceDates]) => ({ id, serviceDates })),
    decisions: decisions.sort((a, b) =>
      compareStrings(
        `${key(a)}:${a.kind === 'pattern' ? a.dateSetId : ''}`,
        `${key(b)}:${b.kind === 'pattern' ? b.dateSetId : ''}`,
      ),
    ),
  };
}
