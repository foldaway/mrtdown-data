import { ScheduledAssignedTimetableSchema } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { combinedReviewFixture } from './__tests__/combinedReviewFixture.js';
import { hashBytes } from './capture.js';
import {
  prepareCombinedTimetableArtifact,
  verifyCombinedTimetableArtifact,
} from './combinedTimetableArtifact.js';
import { createScheduledCombinedReview } from './scheduledCombinedReview.js';

function fixture() {
  const { inputs, sharedServiceMemberships } = combinedReviewFixture(
    true,
    true,
  );
  return {
    inputs: { ...inputs, sharedServiceMemberships },
    capture: {
      schema_version: 1,
      capture_id: 'synthetic',
      feed_kind: 'schedule',
      source:
        'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
      retrieved_at: '2026-11-02T20:00:00Z',
      provider_timestamp: null,
      sha256: inputs.captureSha256,
      byte_length: 1,
      archive_ref: 'synthetic/schedule.zip',
      attribution: 'Synthetic fixture',
      rights_status: 'pending_review',
      licence_reference: 'https://example.org/licence',
    },
  };
}

describe('combined timetable artifact', () => {
  it('replays byte for byte and round-trips every proposed trip, date and call', () => {
    const { inputs, capture } = fixture();
    const review = createScheduledCombinedReview(inputs);
    const approval = {
      schemaVersion: 1,
      documentKind: 'gtfs-combined-mapping-approval',
      identity: review.identity,
      draftSha256: review.draftSha256,
      reviewer: 'Synthetic reviewer',
      reason: 'Exercise mapping approval in the producer',
    };
    const result = prepareCombinedTimetableArtifact(
      inputs,
      review,
      capture,
      approval,
    );
    const replay = prepareCombinedTimetableArtifact(
      inputs,
      JSON.parse(JSON.stringify(review)),
      capture,
      approval,
    );
    expect(replay.artifactBytes.equals(result.artifactBytes)).toBe(true);
    const artifact = verifyCombinedTimetableArtifact(
      result.artifactBytes,
      result.artifactSha256,
    );
    expect(artifact).toMatchObject({
      assignmentsSha256: result.proposals.assignmentsSha256,
      mappingApprovalSha256: result.proposals.review.mappingApprovalSha256,
      generationEligible: false,
      coverage: { assignedTripDateCount: 90, unassignedTripDateCount: 0 },
    });
    expect(result.proposals.review.readiness).toBe('reviewed-mapping-only');
    expect(artifact.trips.map((trip) => trip.providerTripId)).toEqual([
      ...new Set(artifact.assignments.map((row) => row.providerTripId)),
    ]);
    const trips = new Map(
      artifact.trips.map((trip) => [trip.providerTripId, trip]),
    );
    const expanded = artifact.assignments.map(
      ({ providerTripId, patternId, dateSetId }) => {
        const trip = trips.get(providerTripId);
        if (!trip) throw new Error('Missing trip');
        const { stopTimes, ...source } = trip;
        const { calls, ...pattern } = artifact.patterns[patternId];
        return {
          ...source,
          ...pattern,
          serviceDates: artifact.dateSets[dateSetId],
          calls: calls.map((call, index) => ({
            ...stopTimes[index],
            ...call,
            index,
          })),
        };
      },
    );
    expect(expanded).toEqual(result.proposals.document.assignments);
    expect(ScheduledAssignedTimetableSchema.safeParse(artifact).success).toBe(
      false,
    );
    expect(() =>
      verifyCombinedTimetableArtifact(
        Buffer.concat([result.artifactBytes, Buffer.from('\n')]),
        result.artifactSha256,
      ),
    ).toThrow(/expected SHA-256/);
  });

  it('rejects missing records and invalid eligibility even with a matching digest', () => {
    const { inputs, capture } = fixture();
    const result = prepareCombinedTimetableArtifact(
      inputs,
      createScheduledCombinedReview(inputs),
      capture,
    );
    const artifact = verifyCombinedTimetableArtifact(
      result.artifactBytes,
      result.artifactSha256,
    );
    for (const [field, value, message] of [
      ['providerTripId', 'missing-trip', 'missing source trip'],
      ['patternId', '0'.repeat(64), 'missing mapping pattern'],
      ['dateSetId', '0'.repeat(64), 'missing service date set'],
    ] as const) {
      const edited = structuredClone(artifact);
      edited.assignments[0][field] = value;
      const bytes = Buffer.from(JSON.stringify(edited));
      expect(() =>
        verifyCombinedTimetableArtifact(bytes, hashBytes(bytes)),
      ).toThrow(message);
    }
    const bytes = Buffer.from(
      JSON.stringify({ ...artifact, generationEligible: true }),
    );
    expect(() =>
      verifyCombinedTimetableArtifact(bytes, hashBytes(bytes)),
    ).toThrow(/generationEligible/);
  });

  it('keeps unresolved dates visible without packing those trips', () => {
    const {
      inputs: { sharedServiceMemberships: _, ...inputs },
      capture,
    } = fixture();
    const review = createScheduledCombinedReview(inputs);
    const result = prepareCombinedTimetableArtifact(inputs, review, capture);
    const artifact = verifyCombinedTimetableArtifact(
      result.artifactBytes,
      result.artifactSha256,
    );
    expect(artifact.coverage).toMatchObject({
      assignedTripDateCount: 50,
      unassignedTripDateCount: 40,
      gaps: [{ providerTripIds: ['SHARED', 'SHARED_NO_PICKUP'] }],
    });
    expect(
      artifact.trips.some((trip) => trip.providerTripId.startsWith('SHARED')),
    ).toBe(false);
    expect(() =>
      prepareCombinedTimetableArtifact(inputs, review, {
        ...capture,
        sha256: '0'.repeat(64),
      }),
    ).toThrow(/differs from the mapping inputs/);
  });
});
