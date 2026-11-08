import {
  ScheduledTimetableArtifactMetadataSchema,
  ScheduledTripTimesSchema,
} from '@mrtdown/core';
import z from 'zod';
import { hashBytes, singaporeCaptureDate } from './capture.js';
import {
  createScheduledCombinedTripAssignmentProposals,
  ScheduledCombinedTripAssignmentDocumentSchema,
  ScheduledCombinedTripAssignmentSchema,
} from './scheduledCombinedAssignments.js';
import type { ScheduledCombinedReviewInputs } from './scheduledCombinedReview.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const assignment = ScheduledCombinedTripAssignmentSchema.shape;
const call = assignment.calls.element.shape;
const patternSchema = ScheduledCombinedTripAssignmentSchema.pick({
  providerPatternId: true,
  lineId: true,
  serviceMemberships: true,
  destinationStationId: true,
  pathBasis: true,
  routeMapping: true,
}).extend({
  calls: z
    .array(
      z
        .object({
          stationId: call.stationId,
          platformSemantics: call.platformSemantics,
          platforms: call.platforms,
        })
        .strict(),
    )
    .min(2),
});

/** Inspection artifact with explicit effective dates and one timing record per source trip. */
export const CombinedTimetableArtifactSchema =
  ScheduledCombinedTripAssignmentDocumentSchema.omit({
    assignments: true,
  })
    .extend({
      documentKind: z.literal('gtfs-combined-timetable-artifact'),
      capture: ScheduledTimetableArtifactMetadataSchema.shape.capture,
      sourceFeedInfo:
        ScheduledTimetableArtifactMetadataSchema.shape.sourceFeedInfo,
      assignmentsSha256: digest,
      trips: z.array(ScheduledTripTimesSchema),
      patterns: z.record(digest, patternSchema),
      dateSets: z.record(digest, assignment.serviceDates),
      assignments: z.array(
        z
          .object({
            providerTripId: assignment.providerTripId,
            patternId: digest,
            dateSetId: digest,
          })
          .strict(),
      ),
      generationEligible: z.literal(false),
    })
    .superRefine((artifact, context) => {
      const { captureServiceDate } = artifact.applicabilityPolicy;
      if (
        captureServiceDate !== undefined &&
        captureServiceDate !==
          singaporeCaptureDate(artifact.capture.retrieved_at)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['applicabilityPolicy', 'captureServiceDate'],
          message:
            'Capture service date must match the receipt in Singapore time',
        });
      }
      const tripIds = new Set(
        artifact.trips.map((trip) => trip.providerTripId),
      );
      for (const [index, row] of artifact.assignments.entries()) {
        const issue = (field: string, message: string) =>
          context.addIssue({
            code: 'custom',
            path: ['assignments', index, field],
            message,
          });
        if (!tripIds.has(row.providerTripId)) {
          issue(
            'providerTripId',
            'Assignment references a missing source trip',
          );
        }
        if (!Object.hasOwn(artifact.patterns, row.patternId)) {
          issue('patternId', 'Assignment references a missing mapping pattern');
        }
        if (!Object.hasOwn(artifact.dateSets, row.dateSetId)) {
          issue(
            'dateSetId',
            'Assignment references a missing service date set',
          );
        }
      }
    });

/** The caller supplies the verified capture and its matching source and canonical context. */
export function prepareCombinedTimetableArtifact(
  inputs: ScheduledCombinedReviewInputs,
  review: unknown,
  captureInput: unknown,
  approval?: unknown,
) {
  const capture =
    CombinedTimetableArtifactSchema.shape.capture.parse(captureInput);
  if (capture.sha256 !== inputs.captureSha256) {
    throw new Error(
      'Combined timetable capture differs from the mapping inputs',
    );
  }
  const proposals = createScheduledCombinedTripAssignmentProposals(
    { ...inputs, captureRetrievedAt: capture.retrieved_at },
    review,
    approval,
  );
  const { assignments, ...provenance } = proposals.document;
  const trips = new Map<string, z.infer<typeof ScheduledTripTimesSchema>>();
  const patterns = new Map<string, z.infer<typeof patternSchema>>();
  const dateSets = new Map<string, string[]>();
  const allocations = assignments.map((row) => {
    const {
      providerTripId,
      providerRouteId,
      providerCalendarId,
      serviceDates,
      calls,
      ...mapping
    } = row;
    const mappedCalls = [];
    const stopTimes = [];
    for (const {
      index,
      stationId,
      platformSemantics,
      platforms,
      ...time
    } of calls) {
      if (index !== stopTimes.length)
        throw new Error('Combined timetable calls must be in source order');
      mappedCalls.push({ stationId, platformSemantics, platforms });
      stopTimes.push(time);
    }
    // Dated allocations of the same source trip share its original timing.
    if (!trips.has(providerTripId)) {
      trips.set(providerTripId, {
        providerTripId,
        providerRouteId,
        providerCalendarId,
        stopTimes,
      });
    }
    const pattern = { ...mapping, calls: mappedCalls };
    const patternId = hashBytes(Buffer.from(JSON.stringify(pattern)));
    const dateSetId = hashBytes(Buffer.from(JSON.stringify(serviceDates)));
    patterns.set(patternId, pattern);
    dateSets.set(dateSetId, serviceDates);
    return { providerTripId, patternId, dateSetId };
  });
  const artifact = CombinedTimetableArtifactSchema.parse({
    ...provenance,
    documentKind: 'gtfs-combined-timetable-artifact',
    capture,
    sourceFeedInfo: inputs.context.tables['feed_info.txt'] ?? [],
    assignmentsSha256: proposals.assignmentsSha256,
    trips: [...trips.values()],
    patterns: Object.fromEntries(patterns),
    dateSets: Object.fromEntries(dateSets),
    assignments: allocations,
    generationEligible: false,
  });
  const artifactBytes = Buffer.from(JSON.stringify(artifact));
  return {
    proposals,
    artifactBytes,
    artifactSha256: hashBytes(artifactBytes),
  };
}

/** Check exact bytes against an independently trusted digest before decoding. */
export function verifyCombinedTimetableArtifact(
  bytes: Uint8Array,
  expectedSha256: string,
) {
  if (hashBytes(bytes) !== expectedSha256) {
    throw new Error(
      'Combined timetable artifact does not match its expected SHA-256',
    );
  }
  return CombinedTimetableArtifactSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
