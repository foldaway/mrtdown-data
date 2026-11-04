import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { hashBytes } from './capture.js';
import {
  GroupedScopedReconciliationApprovalSchema,
  GroupedScopedReconciliationDraftSchema,
  groupedScopedReviewDraftSha256,
} from './groupedReviewContract.js';
import {
  createScheduledHolidayMappingDraft,
  evaluateScheduledHolidayMapping,
  ScheduledHolidayMappingApprovalSchema,
  ScheduledHolidayMappingDraftSchema,
  scheduledHolidayMappingDraftSha256,
} from './scheduledHolidayMapping.js';
import { scheduledHolidayCalendarSha256 } from './scheduledHolidayPolicy.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import { evaluateGroupedScopedReconciliation } from './scopedReview.js';
import { scopedReviewDateSetId } from './scopedReviewContract.js';

function inputs(complete = true) {
  const input = holidayFixture();
  if (complete) {
    input.context.tables['routes.txt'] = input.context.tables[
      'routes.txt'
    ].filter((row) => row.route_id === 'NEL_TEST');
    input.context.tables['trips.txt'] = input.context.tables[
      'trips.txt'
    ].filter((row) => row.route_id === 'NEL_TEST');
    input.context.tables['stop_times.txt'] = input.context.tables[
      'stop_times.txt'
    ].filter((row) => row.trip_id?.startsWith('NEL_TEST_'));
  }
  return input;
}

function prepare(input = inputs()) {
  const { context, policy, calendar } = input;
  const review = createScheduledHolidayReviewDraft(context, policy, calendar);
  const draft = createScheduledHolidayMappingDraft(
    context,
    policy,
    calendar,
    review,
    { preparedBy: 'Synthetic mapping test' },
  );
  return { ...input, review, draft };
}

type Prepared = ReturnType<typeof prepare>;
function approval(draft: Prepared['draft']) {
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-holiday-mapping-approval',
    identity: draft.identity,
    draftSha256: scheduledHolidayMappingDraftSha256(draft),
    reviewer: 'Synthetic test reviewer',
    reason: 'Synthetic approval assertion; no real capture approval.',
  };
}

function evaluate(input: Prepared, suppliedApproval?: unknown) {
  return evaluateScheduledHolidayMapping(
    input.context,
    input.policy,
    input.calendar,
    input.review,
    input.draft,
    suppliedApproval,
  );
}

describe('policy-aware holiday mapping gate', () => {
  it('requires exact explicit approval and complete global evidence, while keeping generation gated', () => {
    const input = prepare();
    const before = structuredClone(input);
    expect(evaluate(input)).toMatchObject({
      valid: true,
      coverageComplete: true,
      readiness: 'unapproved',
      approvalMatches: false,
      mappingReviewEligible: false,
    });
    expect(evaluate(input, approval(input.draft))).toMatchObject({
      readiness: 'reviewed-mapping-only',
      approvalMatches: true,
      mappingReviewEligible: true,
      generationEligible: false,
    });
    expect(input).toEqual(before);

    const partial = prepare(inputs(false));
    expect(evaluate(partial, approval(partial.draft))).toMatchObject({
      valid: true,
      coverageComplete: true,
      readiness: 'unresolved',
      approvalMatches: true,
      mappingReviewEligible: false,
    });
    expect(
      partial.draft.mapping.decisions.some(
        (item) => item.kind === 'route' && item.providerId === 'NSL_TEST',
      ),
    ).toBe(true);
  });

  it('isolates literal and derived contracts and invalidates edited approved text', () => {
    const input = prepare();
    const derivedApproval = approval(input.draft);
    const literalApproval = {
      schemaVersion: 3,
      documentKind: 'gtfs-scoped-mapping-approval',
      identity: input.draft.mapping.identity,
      draftSha256: groupedScopedReviewDraftSha256(input.draft.mapping),
      reviewer: 'Synthetic reviewer',
      reason: 'Synthetic literal approval cannot approve derived dates.',
    };
    expect(
      GroupedScopedReconciliationDraftSchema.safeParse(input.draft).success,
    ).toBe(false);
    expect(
      ScheduledHolidayMappingDraftSchema.safeParse(input.draft.mapping).success,
    ).toBe(false);
    expect(
      GroupedScopedReconciliationApprovalSchema.safeParse(derivedApproval)
        .success,
    ).toBe(false);
    expect(
      ScheduledHolidayMappingApprovalSchema.safeParse(literalApproval).success,
    ).toBe(false);
    expect(() => evaluate(input, literalApproval)).toThrow();
    expect(
      evaluateGroupedScopedReconciliation(
        input.context,
        input.draft.mapping,
        literalApproval,
      ),
    ).toMatchObject({ valid: false, mappingReviewEligible: false });
    input.draft.mapping.decisions[0].reason = 'Edited review explanation.';
    expect(evaluate(input, derivedApproval)).toMatchObject({
      valid: false,
      approvalMatches: false,
      mappingReviewEligible: false,
    });
  });

  it('rejects stale policy, authoritative calendar, source, canonical and review claims', () => {
    const scenarios = [
      (input: Prepared) => {
        input.policy.revision = 'synthetic-v2';
      },
      (input: Prepared) => {
        input.calendar.dates[0].date = '2026-01-02';
        input.policy.holidayCalendarSha256 = scheduledHolidayCalendarSha256(
          input.calendar,
        );
      },
      (input: Prepared) => {
        input.context.identity.sourceManifest = {
          'calendar.txt': 'd'.repeat(64),
        };
      },
      (input: Prepared) => {
        input.context.identity.canonicalCommit = 'd'.repeat(40);
      },
      (input: Prepared) => {
        input.review.patterns[0].serviceDates = [];
      },
    ];
    for (const change of scenarios) {
      const input = prepare();
      const suppliedApproval = approval(input.draft);
      change(input);
      expect(() => evaluate(input, suppliedApproval)).toThrow();
    }
    const population = prepare();
    population.draft.identity.datePopulationSha256 = 'e'.repeat(64);
    expect(evaluate(population, approval(population.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });
  });

  it('cannot approve unresolved source coverage by ignoring entities and excluding their dates', () => {
    const input = prepare(inputs(false));
    for (const decision of input.draft.mapping.decisions) {
      if (decision.disposition !== 'unresolved') continue;
      decision.disposition =
        decision.kind === 'pattern' ? 'excluded' : 'ignored';
      decision.reason = 'Synthetic attempted waiver of unresolved coverage.';
    }
    const result = evaluate(input, approval(input.draft));
    expect(result).toMatchObject({
      valid: false,
      approvalMatches: true,
      coverageComplete: true,
      unresolvedDecisions: 0,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(result.matchedPatternDates).toBeGreaterThan(0);
    expect(result.excludedPatternDates).toBeGreaterThan(0);
  });

  it('rechecks edited mapping coverage and targets even when approval binds the edited draft', () => {
    const missing = prepare();
    missing.draft.mapping.decisions = missing.draft.mapping.decisions.filter(
      (item) => item.kind !== 'pattern',
    );
    missing.draft.mapping.dateSets = [];
    expect(evaluate(missing, approval(missing.draft))).toMatchObject({
      valid: true,
      coverageComplete: false,
      mappingReviewEligible: false,
    });

    const overlap = prepare();
    const cell = overlap.draft.mapping.decisions.find(
      (item) => item.kind === 'pattern',
    );
    if (!cell) throw new Error('Missing synthetic pattern cell');
    overlap.draft.mapping.decisions.push(structuredClone(cell));
    expect(evaluate(overlap, approval(overlap.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });

    const outside = prepare();
    const pattern = outside.draft.mapping.decisions.find(
      (item) => item.kind === 'pattern',
    );
    if (pattern?.kind !== 'pattern') throw new Error('Missing pattern');
    const dateSet = outside.draft.mapping.dateSets.find(
      (set) => set.id === pattern.dateSetId,
    );
    if (!dateSet) throw new Error('Missing synthetic date set');
    dateSet.serviceDates.push('2027-01-01');
    dateSet.id = scopedReviewDateSetId(dateSet.serviceDates);
    pattern.dateSetId = dateSet.id;
    expect(evaluate(outside, approval(outside.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });

    const target = prepare();
    const matched = target.draft.mapping.decisions.find(
      (item) => item.kind === 'pattern',
    );
    if (matched?.target?.kind !== 'serviceRevision')
      throw new Error('Missing synthetic target');
    matched.target.id = 'invented-service';
    expect(evaluate(target, approval(target.draft))).toMatchObject({
      valid: false,
      mappingReviewEligible: false,
    });

    const blocked = inputs();
    blocked.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    blocked.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(blocked.context.topology)),
    );
    const unresolved = prepare(blocked);
    expect(evaluate(unresolved, approval(unresolved.draft))).toMatchObject({
      valid: true,
      readiness: 'unresolved',
      approvalMatches: true,
      mappingReviewEligible: false,
      generationEligible: false,
    });
  });
});
