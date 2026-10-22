import z from 'zod';
import {
  type ScheduledTimetableArtifactManifest,
  ScheduledTimetableArtifactManifestSchema,
} from '../schema/ScheduledTimetableArtifact.js';
import {
  type ScheduledTimetableSourceReview,
  ScheduledTimetableSourceReviewSchema,
} from '../schema/ScheduledTimetableSourceReview.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z
  .object({
    manifestSha256: digest,
    manifest: ScheduledTimetableArtifactManifestSchema,
  })
  .strict();

const inputSchema = z
  .object({
    candidate: artifact,
    incumbent: artifact.optional(),
    review: ScheduledTimetableSourceReviewSchema.optional(),
    importInstant: z.iso.datetime({ offset: true }),
  })
  .strict();
type Artifact = {
  manifestSha256: string;
  manifest: ScheduledTimetableArtifactManifest;
};

function identity(value: Artifact) {
  return {
    manifestSha256: value.manifestSha256,
    snapshotSha256: value.manifest.capture.sha256,
  };
}

function sameIdentity(
  left: ScheduledTimetableSourceReview['predecessor'],
  right: ScheduledTimetableSourceReview['predecessor'],
) {
  return (
    left?.manifestSha256 === right?.manifestSha256 &&
    left?.snapshotSha256 === right?.snapshotSha256
  );
}

function sameFields(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([key, value]) => right[key] === value)
  );
}

/** Source admission only: callers must first verify bytes against trusted digests. */
export function assessScheduledTimetableSourceChange(input: {
  candidate: Artifact;
  incumbent?: Artifact;
  review?: ScheduledTimetableSourceReview;
  importInstant: string;
}) {
  const { candidate, incumbent, review, importInstant } =
    inputSchema.parse(input);
  const manifest = candidate.manifest;
  const feedInfo = manifest.sourceFeedInfo[0];
  const providerVersion = {
    value: feedInfo?.feed_version || null,
    ordering: 'unproven' as const,
    reason:
      'No documented monotonic provider ordering is configured; feed_version is opaque.',
  };
  const blockers: string[] = [];
  let action: 'unchanged' | 'baseline' | 'successor' | 'correction' | null =
    null;
  const importTime = Date.parse(importInstant);
  if (Date.parse(manifest.capture.retrieved_at) > importTime + 300_000) {
    blockers.push('capture-time-in-future');
  }
  if (
    manifest.sourceFeedInfo.length !== 1 ||
    feedInfo.feed_start_date !==
      manifest.feedRange.startDate.replaceAll('-', '') ||
    feedInfo.feed_end_date !== manifest.feedRange.endDate.replaceAll('-', '')
  ) {
    blockers.push('invalid-source-feed-range');
  }

  if (incumbent?.manifestSha256 === candidate.manifestSha256) {
    action = 'unchanged';
  } else {
    let requiredDecision: ScheduledTimetableSourceReview['decision'] =
      'baseline';
    if (incumbent) {
      const previous = incumbent.manifest;
      if (previous.capture.sha256 === manifest.capture.sha256) {
        action = 'correction';
        requiredDecision = 'correction';
        if (manifest.correctionRevision <= previous.correctionRevision) {
          blockers.push('correction-revision-not-increased');
        }
        if (
          previous.capture.byte_length !== manifest.capture.byte_length ||
          !sameFields(
            previous.identity.sourceManifest,
            manifest.identity.sourceManifest,
          ) ||
          previous.sourceFeedInfo.length !== 1 ||
          !sameFields(previous.sourceFeedInfo[0], feedInfo ?? {}) ||
          previous.feedRange.startDate !== manifest.feedRange.startDate ||
          previous.feedRange.endDate !== manifest.feedRange.endDate
        ) {
          blockers.push('same-snapshot-metadata-conflict');
        }
      } else {
        action = 'successor';
        const previousVersion = previous.sourceFeedInfo[0]?.feed_version;
        requiredDecision =
          providerVersion.value && previousVersion === providerVersion.value
            ? 'resolve-version-conflict'
            : 'successor';
      }
    } else {
      action = 'baseline';
    }

    if (!review) {
      blockers.push(
        requiredDecision === 'resolve-version-conflict'
          ? 'provider-version-conflict'
          : 'source-review-required',
      );
    } else {
      if (
        review.decision !== requiredDecision ||
        !sameIdentity(
          review.predecessor,
          incumbent ? identity(incumbent) : null,
        ) ||
        !sameIdentity(review.successor, identity(candidate))
      ) {
        blockers.push('source-review-mismatch');
      }
      const reviewedAt = Date.parse(review.reviewedAt);
      if (
        reviewedAt < Date.parse(manifest.capture.retrieved_at) ||
        reviewedAt > importTime
      ) {
        blockers.push('source-review-time-invalid');
      }
    }
  }

  return {
    sourceEligible: blockers.length === 0,
    action: blockers.length === 0 ? action : null,
    blockers,
    providerVersion,
    retrievedAt: manifest.capture.retrieved_at,
    importInstant,
  };
}
