import { ScheduledTimetablePagesEntrySchema } from '@mrtdown/core';
import z from 'zod';
import { hashBytes } from './capture.js';
import {
  GroupedScopedReconciliationApprovalSchema,
  GroupedScopedReconciliationDraftSchema,
} from './groupedReviewContract.js';
import {
  fingerprint,
  ScopedReconciliationApprovalSchema,
  ScopedReconciliationDraftSchema,
  scopedReviewDraftFingerprint,
} from './scopedReviewContract.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';
import {
  GtfsTimetableReleaseReviewSchema,
  GtfsTimetableTermsSchema,
  gtfsTimetableMappingApprovalSha256,
} from './timetableRelease.js';

// These are the consumer's required fields; the authenticated producer report
// also carries detailed coverage and reconciliation diagnostics.
const releaseReportSchema = z.object({
  schemaVersion: z.literal(1),
  documentKind: z.literal('gtfs-timetable-release'),
  manifestSha256: ScheduledTimetablePagesEntrySchema.shape.manifestSha256,
  release: z.object({
    eligible: z.literal(true),
    blockers: z.array(z.string()).length(0),
    mappingApprovalSha256:
      ScheduledTimetablePagesEntrySchema.shape.manifestSha256,
    reviewSha256: ScheduledTimetablePagesEntrySchema.shape.manifestSha256,
    releaseInstant: z.iso.datetime({ offset: true }),
  }),
  review: z.object({ mappingReviewEligible: z.literal(true) }),
  coverage: ScheduledTimetablePagesEntrySchema.shape.coverage.strip(),
  currentTerms: GtfsTimetableTermsSchema,
});

function decode(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function requireEqual(actual: unknown, expected: unknown, description: string) {
  if (fingerprint(actual) !== fingerprint(expected)) {
    throw new Error(`Scheduled timetable bundle ${description} does not match`);
  }
}

/** The entry must come from an independently trusted Pages root manifest. */
export async function readScheduledTimetablePagesBundle(
  entryInput: unknown,
  readBytes: (path: string) => Uint8Array | Promise<Uint8Array>,
) {
  if (entryInput === undefined) {
    return null;
  }
  const entry = ScheduledTimetablePagesEntrySchema.parse(entryInput);
  const read = async (name: string) =>
    Uint8Array.from(await readBytes(`scheduled-timetable/${name}`));
  const [manifestBytes, releaseBytes] = await Promise.all([
    read('manifest.json'),
    read('release.json'),
  ]);
  if (hashBytes(releaseBytes) !== entry.releaseSha256) {
    throw new Error(
      'Scheduled timetable release report SHA-256 does not match',
    );
  }
  const report = releaseReportSchema.parse(decode(releaseBytes));
  requireEqual(
    report.manifestSha256,
    entry.manifestSha256,
    'manifest identity',
  );
  requireEqual(report.coverage, entry.coverage, 'coverage');

  const [timetableBytes, noticeBytes, draftBytes, approvalBytes, reviewBytes] =
    await Promise.all([
      read('timetable.json'),
      read('NOTICE.txt'),
      read('mapping-draft.json'),
      read('mapping-approval.json'),
      read('release-review.json'),
    ]);
  const verified = verifyScheduledTimetableArtifact(
    manifestBytes,
    entry.manifestSha256,
    { timetableBytes, noticeBytes },
  );
  const { manifest } = verified;
  requireEqual(manifest.capture, entry.capture, 'capture');
  requireEqual(manifest.feedRange, entry.feedRange, 'feed range');
  requireEqual(
    manifest.currentLicenceReference,
    entry.currentLicenceReference,
    'licence reference',
  );
  const draft = z
    .union([
      ScopedReconciliationDraftSchema,
      GroupedScopedReconciliationDraftSchema,
    ])
    .parse(decode(draftBytes));
  const mappingApproval = z
    .union([
      ScopedReconciliationApprovalSchema,
      GroupedScopedReconciliationApprovalSchema,
    ])
    .parse(decode(approvalBytes));
  const releaseReview = GtfsTimetableReleaseReviewSchema.parse(
    decode(reviewBytes),
  );
  const draftSha256 = scopedReviewDraftFingerprint(draft);
  requireEqual(draft.identity, manifest.identity, 'draft provenance');
  requireEqual(
    mappingApproval.identity,
    manifest.identity,
    'approval provenance',
  );
  requireEqual(
    mappingApproval.schemaVersion,
    draft.schemaVersion,
    'mapping format',
  );
  requireEqual(draftSha256, manifest.mapping.draftSha256, 'mapping draft');
  requireEqual(mappingApproval.draftSha256, draftSha256, 'approved draft');
  const approvalSha256 = gtfsTimetableMappingApprovalSha256(mappingApproval);
  requireEqual(
    approvalSha256,
    report.release.mappingApprovalSha256,
    'mapping approval',
  );
  requireEqual(
    releaseReview.mappingApprovalSha256,
    approvalSha256,
    'release approval',
  );
  requireEqual(
    releaseReview.manifestSha256,
    entry.manifestSha256,
    'reviewed manifest',
  );
  requireEqual(
    fingerprint(releaseReview),
    report.release.reviewSha256,
    'release review',
  );
  requireEqual(releaseReview.terms, report.currentTerms, 'reviewed terms');
  requireEqual(
    report.currentTerms.licence.reference,
    manifest.currentLicenceReference,
    'terms licence',
  );
  const releasedAt = Date.parse(report.release.releaseInstant);
  const reviewedAt = Date.parse(releaseReview.reviewedAt);
  if (
    reviewedAt < Date.parse(manifest.capture.retrieved_at) ||
    reviewedAt > releasedAt ||
    (releaseReview.effectiveAt !== null &&
      Date.parse(releaseReview.effectiveAt) > releasedAt)
  ) {
    throw new Error(
      'Scheduled timetable bundle has invalid release review timing',
    );
  }
  return {
    entry,
    ...verified,
    manifestBytes,
    timetableBytes,
    noticeBytes,
    releaseBytes,
    draft,
    mappingApproval,
    releaseReview,
    release: report.release,
  };
}
