import { scheduledServiceDayInstant } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { combinedReviewFixture as fixture } from './__tests__/combinedReviewFixture.js';
import { ScheduledTripAssignmentDocumentSchema } from './assignmentInput.js';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import {
  createScheduledCombinedReview,
  verifyScheduledCombinedReview,
} from './scheduledCombinedReview.js';
import {
  applyScheduledSourceJourneyServiceMemberships,
  createScheduledSourceJourneyMappingDraft,
} from './scheduledSourceJourneys.js';

describe('combined review on explicit service-date applicability', () => {
  it('composes shared memberships, repeated source calls and restricted physical associations without duplicate trip accounting', () => {
    const { inputs, sharedServiceMemberships, unusualId, sharedId } = fixture();
    const before = structuredClone(inputs);
    const unresolved = createScheduledCombinedReview(inputs);
    expect(unresolved.accounting.unresolvedTripDateCount).toBe(20);
    const review = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    expect(inputs).toEqual(before);
    expect(review.accounting).toMatchObject({
      supportedTripDateCount: 70,
      proposedTripDateCount: 70,
      unresolvedTripDateCount: 0,
      excludedTripDateCount: 0,
    });
    expect(review.accounting.effectiveTripDateCount).toBe(
      review.accounting.supportedTripDateCount +
        review.accounting.outsideTripDateCount,
    );
    expect(review).toMatchObject({
      readiness: 'unapproved',
      unresolvedEntities: 0,
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    const unusual = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === unusualId,
    );
    expect(unusual?.stopIds).toEqual(['P', 'Q', 'P', 'Q']);
    expect(
      unusual?.reviewCells.every((cell) => cell.disposition === 'proposed'),
    ).toBe(true);
    const grouped = unusual?.platformAssociations[0].occurrences.filter(
      (occurrence) => occurrence.stopId === 'P',
    );
    expect(grouped).toHaveLength(2);
    for (const occurrence of grouped ?? []) {
      expect(
        occurrence.platforms.map((platform) => platform.platformId).sort(),
      ).toEqual(['S_C', 'platform-S']);
      expect(
        occurrence.platforms.find((platform) => platform.platformId === 'S_C')
          ?.accessBySourceRule[0],
      ).toMatchObject({
        boardingStatus: 'not_in_service',
        passengerBoardingEligible: false,
        passengerAlightingEligible: false,
      });
    }
    const shared = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(shared?.reviewCells[0].target?.kind).toBe('sharedServiceRevisions');
    expect(
      verifyScheduledCombinedReview(
        { ...inputs, sharedServiceMemberships },
        review,
      ).valid,
    ).toBe(true);
    expect(
      ScheduledTripAssignmentDocumentSchema.safeParse(review).success,
    ).toBe(false);
  });

  it('validates shared journeys through associated groups using composed access while standalone mapping stays strict', () => {
    const { inputs, sharedServiceMemberships, sharedId } = fixture(true);
    const source = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    expect(() =>
      applyScheduledSourceJourneyServiceMemberships(
        inputs.context,
        inputs.sourceJourneyPolicy,
        inputs.allocationPolicy,
        inputs.holidayPolicy,
        inputs.holidayCalendar,
        source,
        sharedServiceMemberships,
      ),
    ).toThrow(/grouped platform diagnostics/);
    const review = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    expect(review.accounting.unresolvedTripDateCount).toBe(0);
    const shared = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(shared?.reviewCells[0].target?.kind).toBe('sharedServiceRevisions');
    for (const candidate of shared?.platformAssociations ?? []) {
      const platforms = candidate.occurrences[0].platforms;
      expect(platforms).toHaveLength(2);
      expect(
        platforms.find((platform) => platform.platformId === 'S_C')
          ?.accessBySourceRule[0],
      ).toMatchObject({
        boardingStatus: 'not_in_service',
        passengerBoardingEligible: false,
        passengerAlightingEligible: false,
      });
      expect(
        platforms.find((platform) => platform.platformId === 'platform-S')
          ?.accessBySourceRule[0].passengerBoardingEligible,
      ).toBe(true);
    }
    inputs.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    inputs.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(inputs.context.topology)),
    );
    const restrictedSource = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    sharedServiceMemberships.baseDraftSha256 = groupedScopedReviewDraftSha256(
      restrictedSource.mapping.mapping,
    );
    const restricted = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    const blocked = restricted.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(
      blocked?.reviewCells.every(
        (cell) =>
          cell.disposition === 'unresolved' &&
          cell.blockers.includes('platform-or-boarding'),
      ),
    ).toBe(true);
  });

  it('keeps original service-date boundaries for 25-hour calls without approving outside dates', () => {
    const { inputs } = fixture();
    const review = createScheduledCombinedReview(inputs);
    const patterns = review.associationReview.patterns;
    const saturday = patterns.find(
      (pattern) => pattern.providerCalendarId === 'SA',
    );
    const weekday = patterns.find(
      (pattern) => pattern.providerCalendarId === 'WD',
    );
    expect(saturday?.outsideServiceDates).toContain('2026-10-31');
    expect(saturday?.supportedServiceDates).not.toContain('2026-10-31');
    expect(weekday?.supportedServiceDates).toContain('2026-11-30');
    expect(weekday?.supportedServiceDates).not.toContain('2026-12-01');
    expect(scheduledServiceDayInstant('2026-11-30', 25 * 3600)).toBe(
      '2026-11-30T17:00:00Z',
    );
    for (const pattern of patterns) {
      expect(
        [
          ...pattern.supportedServiceDates,
          ...pattern.outsideServiceDates,
        ].sort(),
      ).toEqual(pattern.serviceDates);
    }
  });

  it('rejects incompatible capture or date scope, stale memberships and unsupported claim dates', () => {
    const { inputs, sharedServiceMemberships } = fixture();
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        captureSha256: 'e'.repeat(64),
      }),
    ).toThrow(/capture-bound/);
    const bounds = structuredClone(inputs);
    bounds.applicabilityPolicy.serviceDateRange.endDateExclusive = '2026-11-30';
    expect(() => createScheduledCombinedReview(bounds)).toThrow(
      /identical association bounds/,
    );
    const stale = structuredClone(sharedServiceMemberships);
    stale.baseDraftSha256 = 'a'.repeat(64);
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        sharedServiceMemberships: stale,
      }),
    ).toThrow(/base mapping/);
    const outside = structuredClone(sharedServiceMemberships);
    outside.claims[0].serviceDates.push('2026-12-01');
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        sharedServiceMemberships: outside,
      }),
    ).toThrow(/inside supported applicability/);
  });

  it('reconstructs saved evidence instead of accepting removed dates, collapsed groups or changed access', () => {
    const { inputs } = fixture();
    const review = createScheduledCombinedReview(inputs);
    for (const mutate of [
      (copy: typeof review) => {
        copy.associationReview.patterns[0].outsideServiceDates.pop();
      },
      (copy: typeof review) => {
        copy.associationReview.patterns[0].platformAssociations[0].occurrences[0].platforms.pop();
      },
      (copy: typeof review) => {
        copy.accounting.unresolvedTripDateCount = 0;
      },
    ]) {
      const copy = structuredClone(review);
      mutate(copy);
      expect(() => verifyScheduledCombinedReview(inputs, copy)).toThrow(
        /stale/,
      );
    }
  });
});
