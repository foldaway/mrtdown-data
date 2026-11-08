import { describe, expect, it } from 'vitest';
import { combinedReviewFixture } from './__tests__/combinedReviewFixture.js';
import { ScheduledTripAssignmentDocumentSchema } from './assignmentInput.js';
import {
  createScheduledCombinedTripAssignmentProposals,
  evaluateScheduledCombinedMapping,
  verifyScheduledCombinedTripAssignments,
} from './scheduledCombinedAssignments.js';
import {
  createScheduledCombinedReview,
  type ScheduledCombinedReview,
} from './scheduledCombinedReview.js';

function approval(review: ScheduledCombinedReview) {
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-mapping-approval',
    identity: review.identity,
    draftSha256: review.draftSha256,
    reviewer: 'Synthetic mapping reviewer',
    reason: 'Synthetic exact-report approval, not release permission',
  };
}
/** Construct complete or deliberately unresolved reports without issuing real capture approvals. */
function fixture(shared = true, accessVariant = false) {
  const source = combinedReviewFixture(true, accessVariant);
  const inputs = {
    ...source.inputs,
    ...(shared
      ? { sharedServiceMemberships: source.sharedServiceMemberships }
      : {}),
  };
  return { ...source, inputs, review: createScheduledCombinedReview(inputs) };
}

describe('combined mapping approval and assignment proposals', () => {
  it('prepares one source occurrence with all service and physical memberships, retaining restrictions and overnight times', () => {
    const { inputs, review } = fixture();
    const original = structuredClone(inputs);
    const result = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
    );
    expect(inputs).toEqual(original);
    expect(result.review).toMatchObject({
      readiness: 'unapproved',
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(result.document.coverage).toMatchObject({
      supportedTripDateCount: 70,
      assignedTripDateCount: 70,
      unassignedTripDateCount: 0,
      tripDateCoverageComplete: true,
      gaps: [],
    });
    const shared = result.document.assignments.find(
      (row) => row.providerTripId === 'SHARED',
    );
    expect(
      shared?.serviceMemberships.map((member) => member.serviceId),
    ).toEqual(['SHARED_A', 'SHARED_B']);
    expect(shared?.calls).toHaveLength(2);
    const restricted = shared?.calls[0].platforms.find(
      (platform) => platform.platformId === 'S_C',
    );
    expect(restricted?.accessByService).toHaveLength(2);
    expect(
      restricted?.accessByService.every(
        (access) =>
          !access.passengerBoardingEligible &&
          !access.passengerAlightingEligible,
      ),
    ).toBe(true);
    const unusual = result.document.assignments.find(
      (row) => row.providerTripId === 'UNUSUAL',
    );
    expect(unusual?.pathBasis).toBe('supplied-source-order');
    expect(unusual?.calls.map((call) => call.providerStopId)).toEqual([
      'P',
      'Q',
      'P',
      'Q',
    ]);
    expect(unusual?.calls[0].departureSeconds).toBe(25 * 3600);
    expect(unusual?.serviceDates).toContain('2026-11-30');
    expect(unusual?.serviceDates).not.toContain('2026-12-01');
    expect(
      unusual?.calls
        .at(-1)
        ?.platforms.every((platform) =>
          platform.accessByService.every(
            (access) => !access.passengerBoardingEligible,
          ),
        ),
    ).toBe(true);
    expect(
      ScheduledTripAssignmentDocumentSchema.safeParse(result.document).success,
    ).toBe(false);
    const approved = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
      approval(review),
    );
    expect(approved.review).toMatchObject({
      readiness: 'reviewed-mapping-only',
      mappingReviewEligible: true,
      generationEligible: false,
    });
    expect(approved.document.mappingApprovalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(approved.document.assignments).toEqual(result.document.assignments);
    expect(
      verifyScheduledCombinedTripAssignments(
        inputs,
        review,
        approved.document,
        approval(review),
      ).valid,
    ).toBe(true);
  });

  it('rejects stale reports, mismatched approvals and legacy approval kinds', () => {
    const { inputs, review } = fixture();
    const stale = { ...approval(review), draftSha256: 'a'.repeat(64) };
    expect(
      evaluateScheduledCombinedMapping(inputs, review, stale),
    ).toMatchObject({
      valid: false,
      approvalMatches: false,
      mappingReviewEligible: false,
    });
    expect(() =>
      createScheduledCombinedTripAssignmentProposals(inputs, review, stale),
    ).toThrow(/does not bind/);
    expect(() =>
      evaluateScheduledCombinedMapping(inputs, review, {
        ...approval(review),
        documentKind: 'gtfs-holiday-mapping-approval',
      }),
    ).toThrow();
    const edited = structuredClone(review);
    edited.accounting.unresolvedTripDateCount++;
    expect(() =>
      createScheduledCombinedTripAssignmentProposals(
        inputs,
        edited,
        approval(edited),
      ),
    ).toThrow(/stale/);
  });

  it('keeps unresolved supported dates as gaps even when approval metadata matches', () => {
    const { inputs, review } = fixture(false);
    const result = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
      approval(review),
    );
    expect(result.review).toMatchObject({
      approvalMatches: true,
      readiness: 'unresolved',
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(result.document.coverage).toMatchObject({
      supportedTripDateCount: 70,
      assignedTripDateCount: 50,
      unassignedTripDateCount: 20,
      tripDateCoverageComplete: false,
    });
    expect(result.document.coverage.gaps).toHaveLength(1);
    expect(result.document.coverage.gaps[0].blockers).toContain(
      'temporal-ambiguity',
    );
    expect(
      result.document.assignments.some(
        (row) => row.providerTripId === 'SHARED',
      ),
    ).toBe(false);
    expect(result.document.coverage.effectiveTripDateCount).toBe(
      result.document.coverage.supportedTripDateCount +
        result.document.coverage.outsideTripDateCount,
    );
  });

  it('uses each source trip access and precision instead of aggregated pattern access', () => {
    const { inputs, review } = fixture(true, true);
    const result = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
    );
    const ordinary = result.document.assignments.find(
      (row) => row.providerTripId === 'SHARED',
    );
    const variant = result.document.assignments.find(
      (row) => row.providerTripId === 'SHARED_NO_PICKUP',
    );
    expect(variant?.providerPatternId).toBe(ordinary?.providerPatternId);
    expect(
      ordinary?.calls[0].platforms
        .find((platform) => platform.platformId === 'platform-S')
        ?.accessByService.every((access) => access.passengerBoardingEligible),
    ).toBe(true);
    expect(variant?.calls[0]).toMatchObject({
      pickupType: 1,
      timepoint: 0,
      stopSequence: '9007199254740993',
      departureSeconds: 25 * 3600,
    });
    expect(
      variant?.calls[0].platforms.every((platform) =>
        platform.accessByService.every(
          (access) => !access.passengerBoardingEligible,
        ),
      ),
    ).toBe(true);
    expect(variant?.calls[1]).toMatchObject({
      dropOffType: 2,
      stopSequence: '9007199254740994',
    });
    expect(result.document.coverage.assignedTripDateCount).toBe(90);
  });

  it('returns valid proposals and whole-feed coverage when an unresolved trip has incomplete timing', () => {
    const { inputs } = fixture(false);
    const time = inputs.context.tables['stop_times.txt'].find(
      (row) => row.trip_id === 'SHARED',
    );
    if (!time) throw new Error('Missing synthetic shared stop time');
    time.arrival_time = '';
    const review = createScheduledCombinedReview(inputs);
    const result = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
    );
    expect(result.document.coverage).toMatchObject({
      sourceTripCount: inputs.context.tables['trips.txt'].length,
      assignedTripCount: inputs.context.tables['trips.txt'].length - 1,
      supportedTripDateCount: 70,
      assignedTripDateCount: 50,
      unassignedTripDateCount: 20,
      tripDateCoverageComplete: false,
      gaps: [{ providerTripIds: ['SHARED'] }],
    });
    expect(
      result.document.assignments.some(
        (row) => row.providerTripId === 'SHARED',
      ),
    ).toBe(false);
    expect(
      verifyScheduledCombinedTripAssignments(inputs, review, result.document)
        .valid,
    ).toBe(true);
    // The same timing remains invalid when the trip is proposed.
    const complete = fixture();
    const proposedTime = complete.inputs.context.tables['stop_times.txt'].find(
      (row) => row.trip_id === 'SHARED',
    );
    if (!proposedTime) throw new Error('Missing synthetic shared stop time');
    proposedTime.arrival_time = '';
    expect(() =>
      createScheduledCombinedTripAssignmentProposals(
        complete.inputs,
        createScheduledCombinedReview(complete.inputs),
      ),
    ).toThrow(/exact timepoint requires/);
  });

  it('does not allow boarding when later calls prohibit alighting', () => {
    const { inputs } = fixture();
    for (const time of inputs.context.tables['stop_times.txt']) {
      if (time.trip_id === 'UNUSUAL' && time.stop_sequence !== '1') {
        time.drop_off_type = '1';
      }
    }
    const result = createScheduledCombinedTripAssignmentProposals(
      inputs,
      createScheduledCombinedReview(inputs),
    );
    const trip = result.document.assignments.find(
      (row) => row.providerTripId === 'UNUSUAL',
    );
    expect(trip?.calls[0].pickupType).toBe(0);
    const access = trip?.calls[0].platforms.find(
      (platform) => platform.platformId === 'platform-S',
    )?.accessByService;
    expect(access).toEqual([
      expect.objectContaining({
        passengerBoardingEligible: false,
        passengerAlightingEligible: true,
      }),
    ]);
    expect(
      trip?.calls
        .slice(1)
        .every((call) =>
          call.platforms.every((platform) =>
            platform.accessByService.every(
              (member) => !member.passengerAlightingEligible,
            ),
          ),
        ),
    ).toBe(true);
  });

  it('rejects persisted assignment edits to dates, timing, physical access or coverage', () => {
    const { inputs, review } = fixture();
    const { document } = createScheduledCombinedTripAssignmentProposals(
      inputs,
      review,
    );
    for (const edit of [
      (copy: typeof document) => {
        copy.assignments[0].serviceDates.push('2026-12-01');
      },
      (copy: typeof document) => {
        copy.assignments[0].calls[0].timepoint = 0;
      },
      (copy: typeof document) => {
        copy.assignments[0].calls[0].platforms.pop();
      },
      (copy: typeof document) => {
        const access =
          copy.assignments[0].calls[0].platforms[0].accessByService[0];
        access.passengerBoardingEligible = !access.passengerBoardingEligible;
      },
      (copy: typeof document) => {
        copy.assignments.pop();
      },
      (copy: typeof document) => {
        copy.coverage.assignedTripDateCount = 0;
      },
    ]) {
      const copy = structuredClone(document);
      edit(copy);
      expect(() =>
        verifyScheduledCombinedTripAssignments(inputs, review, copy),
      ).toThrow();
    }
  });
});
