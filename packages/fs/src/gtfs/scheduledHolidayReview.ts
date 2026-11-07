import {
  groupedPlatformDiagnosticsAllow,
  type PlatformGroupTarget,
} from './groupedPlatforms.js';
import { buildDateScopedReconciliationEvidence } from './reconciliationEvidence.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import { operatorMatchesDate, targetOnDate } from './scopedReviewContext.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import { createGroupedScopedReconciliationDraft } from './scopedReviewDraft.js';

/** Draft date-specific candidates, isolated from literal-source mapping/assignment approvals. */
export function createScheduledHolidayReviewDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayCalendarInput: unknown,
) {
  const resolved = resolveScheduledHolidayDates(
    context,
    policyInput,
    holidayCalendarInput,
  );
  if (!resolved.policy) {
    throw new Error('Holiday review requires an explicit policy');
  }
  const pilotLineIds = [
    ...new Set(resolved.policy.families.map((family) => family.lineId)),
  ];
  const literalDraft = createGroupedScopedReconciliationDraft(context, {
    pilotLineIds,
    preparedBy: 'MRTDown deterministic holiday-date proposal tool',
  });
  const entities = literalDraft.decisions.filter(
    (item) => item.kind !== 'pattern',
  );
  for (const family of resolved.policy.families) {
    for (const route of family.providerRouteIds) {
      const decision = entities.find(
        (item) => item.kind === 'route' && item.providerId === route,
      );
      if (
        decision?.target?.kind !== 'line' ||
        decision.target.id !== family.lineId
      ) {
        throw new Error('Holiday family differs from canonical route proposal');
      }
    }
  }
  const datesByPattern = new Map(
    resolved.patterns.map((pattern) => [
      pattern.providerPatternId,
      pattern.serviceDates,
    ]),
  );
  const evidence = buildDateScopedReconciliationEvidence(
    context.tables,
    context.identity,
    context.topology,
    datesByPattern,
    context.sourceJourneyRules,
  );
  const groups = new Map<string, PlatformGroupTarget>();
  for (const item of entities) {
    if (item.kind === 'stop' && item.target?.kind === 'platformGroup') {
      groups.set(item.providerId, item.target);
    }
  }
  const entityId = (kind: string, id: string | undefined) => {
    const item = entities.find(
      (item) => item.kind === kind && item.providerId === id,
    );
    return item?.target && 'id' in item.target ? item.target.id : undefined;
  };
  const patterns = resolved.patterns
    .filter((pattern) => pattern.lineId !== null)
    .map((pattern) => {
      const facts = evidence.patterns.find(
        (item) => item.providerId === pattern.providerPatternId,
      );
      const route = context.tables['routes.txt'].find(
        (row) => row.route_id === pattern.routeId,
      );
      if (!facts || !route) {
        throw new Error('Missing holiday family source evidence');
      }
      const dependenciesResolved = facts.stopIds.every((id) =>
        entities.some(
          (item) =>
            item.kind === 'stop' &&
            item.providerId === id &&
            item.disposition === 'matched',
        ),
      );
      const cells = new Map<
        string,
        {
          serviceDates: string[];
          disposition: 'proposed' | 'unresolved';
          target?: (typeof facts.candidates)[number]['target'];
          blockers: string[];
        }
      >();
      for (const scope of facts.dateScopes.scopes) {
        for (const date of scope.serviceDates) {
          const candidate =
            scope.candidates.length === 1 ? scope.candidates[0] : undefined;
          const blockers: string[] = [];
          if (!facts.candidates.length) blockers.push('no-path-candidate');
          if (!candidate) {
            blockers.push(
              scope.candidates.length ? 'temporal-ambiguity' : 'temporal-gap',
            );
          }
          if (!dependenciesResolved) {
            blockers.push('unresolved-identity-or-platform');
          }
          if (
            !operatorMatchesDate(
              context.topology,
              pattern.lineId ?? undefined,
              entityId('agency', route.agency_id),
              date,
            )
          ) {
            blockers.push('operator-period');
          }
          if (
            candidate &&
            (!targetOnDate(facts.platformDiagnosticScopes, date, candidate) ||
              !groupedPlatformDiagnosticsAllow(facts, candidate, groups))
          ) {
            blockers.push('platform-or-boarding');
          }
          const proposed = candidate && blockers.length === 0;
          const cell = {
            disposition: proposed
              ? ('proposed' as const)
              : ('unresolved' as const),
            ...(proposed ? { target: candidate } : {}),
            blockers,
          };
          const key = fingerprint(cell);
          const previous = cells.get(key) ?? { ...cell, serviceDates: [] };
          previous.serviceDates.push(date);
          cells.set(key, previous);
        }
      }
      return {
        ...pattern,
        sourceRecordSha256: facts.sourceRecordSha256,
        stopIds: facts.stopIds,
        reviewCells: [...cells.values()],
        candidateEvidence: facts.candidates,
        dateScopes: facts.dateScopes,
        platformDiagnosticScopes: facts.platformDiagnosticScopes,
      };
    });
  const draft = {
    schemaVersion: 1 as const,
    documentKind: 'gtfs-holiday-date-review-draft' as const,
    identity: {
      source: literalDraft.identity,
      policySha256: resolved.policySha256,
      datePopulationSha256: resolved.datePopulationSha256,
    },
    policy: resolved.policy,
    entities,
    patterns,
    mappingReviewEligible: false as const,
    generationEligible: false as const,
  };
  return { ...draft, draftSha256: fingerprint(draft) };
}

/** Regenerate every claim against current inputs; this verifies a draft, never an approval. */
export function verifyScheduledHolidayReviewDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayCalendarInput: unknown,
  input: unknown,
) {
  const expected = createScheduledHolidayReviewDraft(
    context,
    policyInput,
    holidayCalendarInput,
  );
  if (fingerprint(input) !== fingerprint(expected)) {
    throw new Error(
      'Holiday review draft is stale or differs from current policy, dates or canonical evidence',
    );
  }
  return {
    valid: true as const,
    draftSha256: expected.draftSha256,
    generationEligible: false as const,
  };
}
