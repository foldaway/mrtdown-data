import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { CombinedTimetableReleaseIndexSchema, hashBytes } from '@mrtdown/fs';

const indexName = 'combined-timetable-release-index.json';

async function readIndex(path) {
  return CombinedTimetableReleaseIndexSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
}

async function preparePull(pagesDir, approvedIndexPath, payloadPath) {
  const [combinedReleaseIndex, approvedIndex, manifestBytes, releaseBytes] =
    await Promise.all([
      readIndex(join(pagesDir, indexName)),
      readIndex(approvedIndexPath),
      readFile(join(pagesDir, 'combined-timetable/manifest.json')),
      readFile(join(pagesDir, 'combined-timetable/release.json')),
    ]);
  if (
    combinedReleaseIndex.manifestSha256 !== approvedIndex.manifestSha256 ||
    combinedReleaseIndex.releaseSha256 !== approvedIndex.releaseSha256 ||
    hashBytes(manifestBytes) !== approvedIndex.manifestSha256 ||
    hashBytes(releaseBytes) !== approvedIndex.releaseSha256
  ) {
    throw new Error('Pages release does not match the approved release index');
  }

  // biome-ignore lint/suspicious/noUndeclaredEnvVars: protected Actions environment secret.
  const reviewJson = process.env.MRTDOWN_COMBINED_TIMETABLE_SOURCE_REVIEW;
  let sourceReview;
  try {
    sourceReview = ScheduledTimetableSourceReviewSchema.parse(
      JSON.parse(reviewJson ?? ''),
    );
  } catch {
    throw new Error('A valid production timetable source review is required');
  }
  const { capture } = JSON.parse(manifestBytes.toString('utf8'));
  if (
    sourceReview.successor.manifestSha256 !== approvedIndex.manifestSha256 ||
    sourceReview.successor.snapshotSha256 !== capture.sha256 ||
    Date.parse(sourceReview.reviewedAt) < Date.parse(capture.retrieved_at) ||
    Date.parse(sourceReview.reviewedAt) > Date.now()
  ) {
    throw new Error('Production source review does not bind this release');
  }
  await writeFile(
    payloadPath,
    JSON.stringify({ combinedReleaseIndex, sourceReview }),
    { flag: 'wx', mode: 0o600 },
  );
}

await preparePull(...process.argv.slice(2));
