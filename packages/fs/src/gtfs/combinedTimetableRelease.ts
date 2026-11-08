import {
  ScheduledTimetableArtifactManifestSchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import z from 'zod';
import { hashBytes } from './capture.js';
import {
  CombinedTimetableArtifactSchema,
  prepareCombinedTimetableArtifact,
  verifyCombinedTimetableArtifact,
} from './combinedTimetableArtifact.js';
import { ScheduledCombinedMappingApprovalSchema } from './scheduledCombinedAssignments.js';
import type { ScheduledCombinedReviewInputs } from './scheduledCombinedReview.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import {
  evaluateGtfsTimetableReleaseConditions,
  GtfsTimetableReleaseReviewSchema,
  GtfsTimetableTermsSchema,
} from './timetableRelease.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifactSchema = CombinedTimetableArtifactSchema.shape;
const manifestSchema = ScheduledTimetableArtifactMetadataSchema.pick({
  schemaVersion: true,
  correctionRevision: true,
  capture: true,
  currentLicenceReference: true,
  mrtdownLicence: true,
}).extend({
  documentKind: z.literal('gtfs-combined-timetable-release-manifest'),
  identity: artifactSchema.identity,
  serviceDateRange: artifactSchema.applicabilityPolicy.shape.serviceDateRange,
  reviewDraftSha256: artifactSchema.reviewDraftSha256,
  mappingApprovalSha256: artifactSchema.mappingApprovalSha256,
  assignmentsSha256: artifactSchema.assignmentsSha256,
  timetable: ScheduledTimetableArtifactManifestSchema.shape.timetable,
});
const evidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-combined-timetable-release-evidence'),
    releaseInstant: z.iso.datetime({ offset: true }),
    mappingApproval: ScheduledCombinedMappingApprovalSchema,
    releaseReview: GtfsTimetableReleaseReviewSchema,
    currentTerms: GtfsTimetableTermsSchema,
  })
  .strict();

export const CombinedTimetableReleaseIndexSchema = z
  .object({ manifestSha256: digest, releaseSha256: digest })
  .strict();
type BundleFiles = {
  manifestBytes: Uint8Array;
  timetableBytes: Uint8Array;
  releaseBytes: Uint8Array;
};

export interface CombinedTimetableReleaseOptions {
  correctionRevision: number;
  currentLicenceReference: string;
  releaseInstant: string;
  mappingApproval?: unknown;
  releaseReview?: unknown;
  currentTerms?: unknown;
}

function assertTopology(
  topology: ScopedReviewContext['topology'],
  expected: ScopedReviewContext['identity']['topology'],
) {
  if (
    topology.projectionVersion !== expected.projectionVersion ||
    hashBytes(Buffer.from(JSON.stringify(topology))) !== expected.sha256
  ) {
    throw new Error('Combined timetable topology differs from canonical data');
  }
}

/** Rebuild from a verified capture/context. The caller supplies trusted reviews and current terms. */
export function inspectCombinedTimetableRelease(
  inputs: ScheduledCombinedReviewInputs,
  draft: unknown,
  captureInput: unknown,
  options: CombinedTimetableReleaseOptions,
) {
  const capture = artifactSchema.capture.parse(captureInput);
  const mappingApproval =
    ScheduledCombinedMappingApprovalSchema.optional().parse(
      options.mappingApproval,
    );
  const review = GtfsTimetableReleaseReviewSchema.optional().parse(
    options.releaseReview,
  );
  const terms = GtfsTimetableTermsSchema.optional().parse(options.currentTerms);
  const releaseInstant = evidenceSchema.shape.releaseInstant.parse(
    options.releaseInstant,
  );
  assertTopology(inputs.context.topology, inputs.context.identity.topology);
  const { proposals, artifactBytes, artifactSha256 } =
    prepareCombinedTimetableArtifact(inputs, draft, capture, mappingApproval);
  const document = proposals.document;
  const manifest = manifestSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-combined-timetable-release-manifest',
    correctionRevision: options.correctionRevision,
    capture,
    currentLicenceReference: options.currentLicenceReference,
    mrtdownLicence: 'CC-BY-4.0',
    identity: document.identity,
    serviceDateRange: document.applicabilityPolicy.serviceDateRange,
    reviewDraftSha256: document.reviewDraftSha256,
    mappingApprovalSha256: document.mappingApprovalSha256,
    assignmentsSha256: proposals.assignmentsSha256,
    timetable: { sha256: artifactSha256, byteLength: artifactBytes.byteLength },
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const manifestSha256 = hashBytes(manifestBytes);
  const release = evaluateGtfsTimetableReleaseConditions({
    manifest,
    manifestSha256,
    mappingReviewEligible:
      proposals.review.mappingReviewEligible &&
      document.coverage.tripDateCoverageComplete,
    approvalSha256: document.mappingApprovalSha256,
    releaseInstant,
    review,
    terms,
  });
  const candidate = { manifest, manifestSha256, release };
  if (!release.eligible || !mappingApproval || !review || !terms) {
    return { ...candidate, bundle: null };
  }
  const evidence = evidenceSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-combined-timetable-release-evidence',
    releaseInstant,
    mappingApproval,
    releaseReview: review,
    currentTerms: terms,
  });
  const releaseBytes = Buffer.from(JSON.stringify(evidence));
  return {
    ...candidate,
    bundle: {
      index: { manifestSha256, releaseSha256: hashBytes(releaseBytes) },
      files: { manifestBytes, timetableBytes: artifactBytes, releaseBytes },
    },
  };
}

function assertCompleteCoverage(
  artifact: z.infer<typeof CombinedTimetableArtifactSchema>,
) {
  const { coverage } = artifact;
  const { startDate, endDateExclusive } =
    artifact.applicabilityPolicy.serviceDateRange;
  const datesByTrip = new Map<string, Set<string>>();
  let assignedPairs = 0;
  for (const { providerTripId, dateSetId } of artifact.assignments) {
    const assignedDates = datesByTrip.get(providerTripId) ?? new Set<string>();
    for (const date of artifact.dateSets[dateSetId]) {
      if (
        date < startDate ||
        date >= endDateExclusive ||
        assignedDates.has(date)
      ) {
        throw new Error(
          `Invalid combined release date for trip ${providerTripId}: ${date}`,
        );
      }
      assignedDates.add(date);
      assignedPairs++;
    }
    datesByTrip.set(providerTripId, assignedDates);
  }
  if (
    !coverage.tripDateCoverageComplete ||
    coverage.gaps.length ||
    coverage.unassignedTripDateCount !== 0 ||
    !assignedPairs ||
    assignedPairs !== coverage.assignedTripDateCount ||
    assignedPairs !== coverage.supportedTripDateCount ||
    datesByTrip.size !== coverage.assignedTripCount ||
    datesByTrip.size !== artifact.trips.length ||
    datesByTrip.size > coverage.sourceTripCount ||
    coverage.effectiveTripDateCount !==
      assignedPairs + coverage.outsideTripDateCount
  ) {
    throw new Error(
      'Combined timetable release requires complete supported coverage',
    );
  }
}

/** A reviewed source allocation can add a service to a physical platform. */
function assertReviewedBoarding(
  artifact: z.infer<typeof CombinedTimetableArtifactSchema>,
  topology: ScopedReviewContext['topology'],
) {
  const stations = new Map(
    topology.stations.map((station) => [station.id, station]),
  );
  const lineByService = new Map(
    topology.services.map(({ id, lineId }) => [id, lineId]),
  );
  const usedPatterns = new Set(
    artifact.assignments.map(({ patternId }) => patternId),
  );
  for (const patternId of usedPatterns) {
    const { lineId, calls } = artifact.patterns[patternId];
    for (const { stationId, platforms } of calls) {
      for (const { platformId, boardingStatus, accessByService } of platforms) {
        const canonical = stations
          .get(stationId)
          ?.platforms.find(({ id }) => id === platformId);
        for (const {
          serviceId,
          serviceScope,
          passengerBoardingEligible,
        } of accessByService) {
          if (
            passengerBoardingEligible &&
            (!canonical ||
              canonical.lineId !== lineId ||
              lineByService.get(serviceId) !== lineId ||
              canonical.boardingStatus ||
              boardingStatus ||
              serviceScope === 'excluded' ||
              (canonical.serviceIds.length &&
                !canonical.serviceIds.includes(serviceId) &&
                serviceScope !== 'listed'))
          ) {
            throw new Error(
              `Combined timetable boarding access differs from canonical topology for ${serviceId} at ${stationId}/${platformId}`,
            );
          }
        }
      }
    }
  }
}

/** The index and installed canonical topology must come from independently trusted inputs. */
export function verifyCombinedTimetableReleaseBundle(
  indexInput: unknown,
  files: BundleFiles,
  topology: ScopedReviewContext['topology'],
) {
  const index = CombinedTimetableReleaseIndexSchema.parse(indexInput);
  if (
    hashBytes(files.manifestBytes) !== index.manifestSha256 ||
    hashBytes(files.releaseBytes) !== index.releaseSha256
  ) {
    throw new Error(
      'Combined release manifest or evidence does not match its expected SHA-256',
    );
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const manifest = manifestSchema.parse(
    JSON.parse(decoder.decode(files.manifestBytes)),
  );
  const evidence = evidenceSchema.parse(
    JSON.parse(decoder.decode(files.releaseBytes)),
  );
  assertTopology(topology, manifest.identity.source.topology);
  const approvalSha256 = fingerprint(evidence.mappingApproval);
  if (
    manifest.mappingApprovalSha256 !== approvalSha256 ||
    manifest.reviewDraftSha256 !== evidence.mappingApproval.draftSha256 ||
    fingerprint(manifest.identity) !==
      fingerprint(evidence.mappingApproval.identity)
  ) {
    throw new Error(
      'Combined release mapping approval does not bind its manifest',
    );
  }
  const release = evaluateGtfsTimetableReleaseConditions({
    manifest,
    manifestSha256: index.manifestSha256,
    mappingReviewEligible: true,
    approvalSha256,
    releaseInstant: evidence.releaseInstant,
    review: evidence.releaseReview,
    terms: evidence.currentTerms,
  });
  if (!release.eligible) throw new Error(release.blockers.join('; '));
  if (files.timetableBytes.byteLength !== manifest.timetable.byteLength) {
    throw new Error(
      'Combined release timetable does not match its recorded size',
    );
  }
  const artifact = verifyCombinedTimetableArtifact(
    files.timetableBytes,
    manifest.timetable.sha256,
  );
  if (
    fingerprint(artifact.capture) !== fingerprint(manifest.capture) ||
    fingerprint(artifact.identity) !== fingerprint(manifest.identity) ||
    fingerprint(artifact.applicabilityPolicy.serviceDateRange) !==
      fingerprint(manifest.serviceDateRange) ||
    artifact.reviewDraftSha256 !== manifest.reviewDraftSha256 ||
    artifact.mappingApprovalSha256 !== approvalSha256 ||
    artifact.assignmentsSha256 !== manifest.assignmentsSha256
  ) {
    throw new Error(
      'Combined timetable provenance does not match its release manifest',
    );
  }
  assertCompleteCoverage(artifact);
  assertReviewedBoarding(artifact, topology);
  return { index, manifest, evidence, artifact };
}
