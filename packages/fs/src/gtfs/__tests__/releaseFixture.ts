import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { groupedScopedReviewDraftSha256 } from '../groupedReviewContract.js';
import { scopedReviewDraftSha256 } from '../scopedReviewContract.js';
import {
  GtfsTimetableReleaseReviewSchema,
  gtfsTimetableMappingApprovalSha256,
} from '../timetableRelease.js';
import { prepareVerifiedGtfsTimetableArtifact } from '../verifiedTimetableArtifact.js';
import { artifactFixture } from './artifactFixture.js';

type Draft = Awaited<ReturnType<typeof artifactFixture>>['options']['draft'];
export async function reviewedReleaseFixture(
  root: string,
  grouped = false,
  edit?: (draft: Draft) => void,
) {
  const { capture, options } = await artifactFixture(root, grouped);
  if (edit) {
    edit(options.draft);
  }
  capture.rights_status = 'redistribution_permitted';
  await writeFile(join(root, 'capture.json'), JSON.stringify(capture));
  const mappingApproval = {
    schemaVersion: options.draft.schemaVersion,
    documentKind: 'gtfs-scoped-mapping-approval',
    identity: options.draft.identity,
    draftSha256: grouped
      ? groupedScopedReviewDraftSha256(options.draft)
      : scopedReviewDraftSha256(options.draft),
    reviewer: 'Synthetic mapping reviewer',
    reason: 'Synthetic approval for release gate tests only.',
  };
  const artifact = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    { ...options, mappingApproval },
  );
  const currentTerms = {
    licence: {
      reference: options.currentLicenceReference,
      sha256: '1'.repeat(64),
    },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256: '2'.repeat(64),
    },
  };
  const releaseReview = GtfsTimetableReleaseReviewSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release-review',
    manifestSha256: artifact.manifestSha256,
    mappingApprovalSha256: gtfsTimetableMappingApprovalSha256(mappingApproval),
    reviewer: 'Synthetic release reviewer',
    reviewedAt: '2026-01-16T00:00:00Z',
    decision: 'release-permitted',
    terms: structuredClone(currentTerms),
    licenceVersion: 'synthetic-v1',
    obligations: 'Synthetic source acknowledgement and licence link.',
    captureConditions:
      'Synthetic review found no additional release conditions.',
    effectiveAt: null,
  });
  return {
    ...options,
    mappingApproval,
    currentTerms,
    releaseReview,
    releaseInstant: '2026-01-20T00:00:00Z',
  };
}
