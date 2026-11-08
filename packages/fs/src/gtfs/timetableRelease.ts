import type { ScheduledTimetableArtifactMetadata } from '@mrtdown/core';
import z from 'zod';
import { GroupedScopedReconciliationApprovalSchema } from './groupedReviewContract.js';
import {
  fingerprint,
  ScopedReconciliationApprovalSchema,
} from './scopedReviewContract.js';
import {
  prepareVerifiedGtfsTimetableArtifact,
  type VerifiedGtfsTimetableArtifactOptions,
} from './verifiedTimetableArtifact.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const termsIdentity = z.object({ reference: z.url(), sha256: digest }).strict();
const mappingApprovalSchema = z.union([
  ScopedReconciliationApprovalSchema,
  GroupedScopedReconciliationApprovalSchema,
]);

export const GtfsTimetableTermsSchema = z
  .object({
    licence: termsIdentity,
    apiTerms: termsIdentity.extend({
      reference: z.literal(
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      ),
    }),
  })
  .strict();
export type GtfsTimetableTerms = z.infer<typeof GtfsTimetableTermsSchema>;

export const GtfsTimetableReleaseReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-timetable-release-review'),
    manifestSha256: digest,
    mappingApprovalSha256: digest,
    reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    decision: z.literal('release-permitted'),
    terms: GtfsTimetableTermsSchema,
    licenceVersion: z.string().trim().min(1),
    obligations: z.string().trim().min(1),
    captureConditions: z.string().trim().min(1),
    effectiveAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type GtfsTimetableReleaseReview = z.infer<
  typeof GtfsTimetableReleaseReviewSchema
>;

export function gtfsTimetableMappingApprovalSha256(input: unknown) {
  return fingerprint(mappingApprovalSchema.parse(input));
}

export interface GtfsTimetableReleaseOptions
  extends VerifiedGtfsTimetableArtifactOptions {
  releaseInstant: string;
  releaseReview?: unknown;
  currentTerms?: unknown;
}

/** Shared release conditions for a verified manifest and supplied review records. */
export function evaluateGtfsTimetableReleaseConditions({
  manifest,
  manifestSha256,
  mappingReviewEligible,
  approvalSha256,
  releaseInstant,
  review,
  terms,
}: {
  manifest: Pick<
    ScheduledTimetableArtifactMetadata,
    'capture' | 'currentLicenceReference'
  >;
  manifestSha256: string;
  mappingReviewEligible: boolean;
  approvalSha256: string | null;
  releaseInstant: string;
  review?: GtfsTimetableReleaseReview;
  terms?: GtfsTimetableTerms;
}) {
  const releaseTime = Date.parse(
    z.iso.datetime({ offset: true }).parse(releaseInstant),
  );
  const blockers: string[] = [];
  if (!mappingReviewEligible) {
    blockers.push('Mapping review is not complete');
  }
  if (manifest.capture.rights_status !== 'redistribution_permitted') {
    blockers.push('Capture redistribution is not permitted');
  }
  if (!terms) {
    blockers.push('Current terms have not been supplied');
  } else if (terms.licence.reference !== manifest.currentLicenceReference) {
    blockers.push('Current terms do not match the artifact licence reference');
  }
  if (!review) {
    blockers.push('Release review is missing');
  } else {
    if (review.manifestSha256 !== manifestSha256) {
      blockers.push('Release review does not bind this artifact');
    }
    if (review.mappingApprovalSha256 !== approvalSha256) {
      blockers.push('Release review does not bind this mapping approval');
    }
    if (terms && fingerprint(review.terms) !== fingerprint(terms)) {
      blockers.push('Release review does not match current terms');
    }
    const reviewedAt = Date.parse(review.reviewedAt);
    if (
      reviewedAt < Date.parse(manifest.capture.retrieved_at) ||
      reviewedAt > releaseTime
    ) {
      blockers.push(
        'Release review time must fall between capture retrieval and release',
      );
    }
    if (
      review.effectiveAt !== null &&
      Date.parse(review.effectiveAt) > releaseTime
    ) {
      blockers.push('Release precedes the reviewed Effective Date');
    }
  }
  return {
    eligible: blockers.length === 0,
    blockers,
    mappingApprovalSha256: approvalSha256,
    reviewSha256: review ? fingerprint(review) : null,
    releaseInstant,
  };
}

/** Review records and freshly acquired terms identities must come from trusted callers. */
export async function inspectGtfsTimetableRelease(
  file: string,
  handoff: string,
  options: GtfsTimetableReleaseOptions,
) {
  const {
    releaseInstant,
    releaseReview: reviewInput,
    currentTerms: termsInput,
    ...preparationOptions
  } = options;
  z.iso.datetime({ offset: true }).parse(releaseInstant);
  const review =
    reviewInput === undefined
      ? undefined
      : GtfsTimetableReleaseReviewSchema.parse(reviewInput);
  const terms =
    termsInput === undefined
      ? undefined
      : GtfsTimetableTermsSchema.parse(termsInput);
  const approvalSha256 =
    preparationOptions.mappingApproval === undefined
      ? null
      : gtfsTimetableMappingApprovalSha256(preparationOptions.mappingApproval);
  const artifact = await prepareVerifiedGtfsTimetableArtifact(
    file,
    handoff,
    preparationOptions,
  );
  return {
    ...artifact,
    release: evaluateGtfsTimetableReleaseConditions({
      manifest: artifact.manifest,
      manifestSha256: artifact.manifestSha256,
      mappingReviewEligible: artifact.review.mappingReviewEligible,
      approvalSha256,
      releaseInstant,
      review,
      terms,
    }),
  };
}
