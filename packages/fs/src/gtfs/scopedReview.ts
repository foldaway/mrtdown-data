import { compareStrings } from './order.js';
import { activeServiceDates } from './reconciliationEvidence.js';
import { partitionScopedCandidates } from './scopedCandidates.js';
import {
  derive,
  operatorMatchesDate,
  sameTarget,
  targetOnDate,
} from './scopedReviewContext.js';
import {
  fingerprint,
  key,
  ScopedReconciliationApprovalSchema,
  ScopedReconciliationDraftSchema,
  type ScopedReviewContext,
  type ScopedReviewDecision,
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';

/** Verify claims and complete coverage; approval is repository-review metadata, not authentication. */
export function evaluateScopedReconciliation(
  context: ScopedReviewContext,
  input: unknown,
  approvalInput?: unknown,
) {
  const draft = ScopedReconciliationDraftSchema.parse(input);
  const { report, evidence, audit } = derive(context);
  const errors: string[] = [];
  if (fingerprint(draft.identity) !== fingerprint(report.identity))
    errors.push('Draft input identity differs from verified context');
  if (new Set(draft.pilotLineIds).size !== draft.pilotLineIds.length)
    errors.push('Duplicate pilot line');
  for (const id of draft.pilotLineIds)
    if (!context.topology.lines.some((line) => line.id === id))
      errors.push(`Unknown pilot line: ${id}`);
  const dateSets = new Map<string, Set<string>>();
  for (const set of draft.dateSets) {
    if (dateSets.has(set.id)) errors.push(`Duplicate date set: ${set.id}`);
    try {
      partitionScopedCandidates(set.serviceDates, []);
    } catch {
      errors.push(`Invalid or duplicate civil dates: ${set.id}`);
    }
    if (scopedReviewDateSetId(set.serviceDates) !== set.id)
      errors.push(`Changed date set: ${set.id}`);
    dateSets.set(set.id, new Set(set.serviceDates));
  }
  const entries = new Map(report.entries.map((entry) => [key(entry), entry]));
  const seen = new Set<string>();
  const sourceCovered = new Set<string>();
  const entityDecisions = new Map<string, ScopedReviewDecision>();
  const coveredDates = new Map<string, Set<string>>();
  const usedDateSets = new Set<string>();
  const missingEntries: string[] = [];
  const missingPatternDates: { providerId: string; serviceDates: string[] }[] =
    [];
  let matchedPatternDates = 0,
    excludedPatternDates = 0,
    unresolvedPatternDates = 0,
    unresolvedDecisions = 0;
  for (const item of draft.decisions) {
    const sourceKey = key(item);
    const source = entries.get(sourceKey);
    if (!source || source.sourceRecordSha256 !== item.sourceRecordSha256)
      errors.push(`Unknown or changed source record: ${sourceKey}`);
    sourceCovered.add(sourceKey);
    if (item.disposition === 'unresolved') unresolvedDecisions++;
    if (item.kind !== 'pattern') {
      if (seen.has(sourceKey))
        errors.push(`Duplicate entity decision: ${sourceKey}`);
      seen.add(sourceKey);
      entityDecisions.set(sourceKey, item);
    }
    if (
      item.disposition === 'matched' &&
      !source?.candidates.some((candidate) =>
        sameTarget(candidate, item.target),
      )
    )
      errors.push(`Target outside source candidates: ${sourceKey}`);
    if (item.kind === 'stop' && item.disposition === 'matched') {
      if (source?.candidates.length !== 1)
        errors.push(
          `Physical platform or station allocation is not unique: ${sourceKey}`,
        );
      const row = context.tables['stops.txt']?.find(
        (row) => row.stop_id === item.providerId,
      );
      if (
        row?.location_type !== '1' &&
        new Set(
          (row?.platform_code ?? '')
            .split('/')
            .map((label) => label.trim())
            .filter(Boolean),
        ).size !== 1
      )
        errors.push(
          `Grouped or missing platform allocation remains unresolved: ${sourceKey}`,
        );
    }
    if (item.kind !== 'pattern') continue;
    usedDateSets.add(item.dateSetId);
    const dates = dateSets.get(item.dateSetId);
    if (!dates) {
      errors.push(`Unknown date set: ${item.dateSetId}`);
      continue;
    }
    const decisionKey = `${sourceKey}:${item.dateSetId}`;
    if (seen.has(decisionKey))
      errors.push(`Duplicate pattern decision: ${decisionKey}`);
    seen.add(decisionKey);
    const pattern = audit.patterns.find(
      (pattern) => pattern.id === item.providerId,
    );
    const facts = evidence.patterns.find(
      (pattern) => pattern.providerId === item.providerId,
    );
    if (!pattern || !facts) continue;
    const active = new Set(
      activeServiceDates(context.tables, pattern.calendarId),
    );
    const covered = coveredDates.get(item.providerId) ?? new Set<string>();
    if (item.disposition === 'matched' && !dates.size)
      errors.push(`Matched cell has no active dates: ${sourceKey}`);
    if (item.disposition === 'inactive' && (active.size || dates.size))
      errors.push(`Inactive disposition has active dates: ${sourceKey}`);
    for (const date of dates) {
      if (!active.has(date))
        errors.push(`Date outside source calendar: ${sourceKey}:${date}`);
      if (covered.has(date))
        errors.push(`Overlapping pattern decisions: ${sourceKey}:${date}`);
      covered.add(date);
      if (item.disposition === 'matched') {
        matchedPatternDates++;
        if (item.target && !targetOnDate(facts.dateScopes, date, item.target))
          errors.push(
            `Target outside temporal candidates: ${sourceKey}:${date}`,
          );
        if (
          item.target &&
          !targetOnDate(facts.platformDiagnosticScopes, date, item.target)
        )
          errors.push(
            `Unresolved current platform diagnostics: ${sourceKey}:${date}`,
          );
      } else if (item.disposition === 'excluded') excludedPatternDates++;
      else if (item.disposition === 'unresolved') unresolvedPatternDates++;
    }
    coveredDates.set(item.providerId, covered);
  }
  // Dependencies are checked after all decisions, independently of their order.
  const requireMatch = (kind: string, id: string, from: string) => {
    const dependency = entityDecisions.get(`${kind}:${id}`);
    if (dependency?.disposition !== 'matched')
      errors.push(`Unmatched dependency: ${from} -> ${kind}:${id}`);
    return dependency;
  };
  const stops = new Map(
    (context.tables['stops.txt'] ?? []).map((row) => [row.stop_id, row]),
  );
  for (const item of draft.decisions) {
    if (item.disposition !== 'matched') continue;
    if (item.kind === 'route') {
      const route = audit.routes.find(
        (row) => row.route_id === item.providerId,
      );
      if (route?.agency_id) requireMatch('agency', route.agency_id, key(item));
    }
    if (item.kind === 'stop') {
      const parent = stops.get(item.providerId)?.parent_station;
      if (parent) {
        const ancestor = requireMatch('stop', parent, key(item));
        if (
          item.target?.stationId &&
          ancestor?.target?.id !== item.target.stationId
        )
          errors.push(`Child/parent station target mismatch: ${key(item)}`);
      }
    }
    if (item.kind !== 'pattern') continue;
    const pattern = audit.patterns.find(
      (pattern) => pattern.id === item.providerId,
    );
    if (!pattern) continue;
    const route = requireMatch('route', pattern.routeId, key(item));
    if (route?.target && !draft.pilotLineIds.includes(route.target.id))
      errors.push(`Matched pattern outside declared pilot: ${key(item)}`);
    for (const id of new Set(pattern.stopIds))
      requireMatch('stop', id, key(item));
    const routeRow = audit.routes.find(
      (row) => row.route_id === pattern.routeId,
    );
    const agency = routeRow?.agency_id
      ? requireMatch('agency', routeRow.agency_id, key(item))
      : undefined;
    for (const date of dateSets.get(item.dateSetId) ?? [])
      if (
        !operatorMatchesDate(
          context.topology,
          route?.target?.id,
          agency?.target?.id,
          date,
        )
      )
        errors.push(
          `Agency/line operator period mismatch: ${key(item)}:${date}`,
        );
  }
  for (const entry of report.entries)
    if (!sourceCovered.has(key(entry))) missingEntries.push(key(entry));
  for (const pattern of audit.patterns) {
    const covered = coveredDates.get(pattern.id) ?? new Set<string>();
    const missing = activeServiceDates(
      context.tables,
      pattern.calendarId,
    ).filter((date) => !covered.has(date));
    if (missing.length)
      missingPatternDates.push({
        providerId: pattern.id,
        serviceDates: missing,
      });
  }
  for (const set of dateSets.keys())
    if (!usedDateSets.has(set)) errors.push(`Unused date set: ${set}`);
  let approvalMatches = false;
  if (approvalInput !== undefined) {
    const approval = ScopedReconciliationApprovalSchema.parse(approvalInput);
    approvalMatches =
      approval.draftSha256 === scopedReviewDraftSha256(draft) &&
      fingerprint(approval.identity) === fingerprint(report.identity);
    if (!approvalMatches)
      errors.push('Approval does not bind this draft and input identity');
  }
  const coverageComplete =
    !missingEntries.length && !missingPatternDates.length;
  const valid = !errors.length;
  const reviewComplete =
    valid && coverageComplete && !unresolvedDecisions && approvalMatches;
  const readiness = !valid
    ? ('invalid' as const)
    : !coverageComplete
      ? ('incomplete' as const)
      : unresolvedDecisions
        ? ('unresolved' as const)
        : !approvalMatches
          ? ('unapproved' as const)
          : !matchedPatternDates
            ? ('no-matched-dates' as const)
            : ('reviewed-mapping-only' as const);
  return {
    readiness,
    valid,
    errors: [...new Set(errors)].sort(compareStrings),
    coverageComplete,
    missingEntries: missingEntries.sort(compareStrings),
    missingPatternDates,
    unresolvedDecisions,
    matchedPatternDates,
    excludedPatternDates,
    unresolvedPatternDates,
    approvalMatches,
    reviewComplete,
    mappingReviewEligible: reviewComplete && matchedPatternDates > 0,
    generationEligible: false as const,
  };
}
