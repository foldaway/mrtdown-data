import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import z from 'zod';
import {
  GroupedScopedReconciliationApprovalSchema,
  GroupedScopedReconciliationDraftSchema,
} from './groupedReviewContract.js';
import {
  ScopedReconciliationApprovalSchema,
  ScopedReconciliationDraftSchema,
} from './scopedReviewContract.js';
import {
  type GtfsTimetableReleaseOptions,
  GtfsTimetableReleaseReviewSchema,
  GtfsTimetableTermsSchema,
  inspectGtfsTimetableRelease,
} from './timetableRelease.js';

function json(input: unknown) {
  return `${JSON.stringify(input, null, 2)}\n`;
}

/** Callers supply trusted reviews, freshly acquired terms identities and the recorded canonical tree. */
export async function exportGtfsTimetableRelease(
  file: string,
  handoff: string,
  outputDirectory: string,
  options: GtfsTimetableReleaseOptions,
) {
  const input = structuredClone(options);
  const artifact = await inspectGtfsTimetableRelease(file, handoff, input);
  const report = {
    schemaVersion: 1 as const,
    documentKind: 'gtfs-timetable-release' as const,
    manifestSha256: artifact.manifestSha256,
    release: artifact.release,
    review: artifact.review,
    coverage: artifact.coverage,
  };
  if (!artifact.release.eligible) {
    return { exported: false as const, ...report };
  }

  const draft = z
    .union([
      ScopedReconciliationDraftSchema,
      GroupedScopedReconciliationDraftSchema,
    ])
    .parse(input.draft);
  const mappingApproval = z
    .union([
      ScopedReconciliationApprovalSchema,
      GroupedScopedReconciliationApprovalSchema,
    ])
    .parse(input.mappingApproval);
  const releaseReview = GtfsTimetableReleaseReviewSchema.parse(
    input.releaseReview,
  );
  const currentTerms = GtfsTimetableTermsSchema.parse(input.currentTerms);
  const requested = resolve(outputDirectory);
  const directory = join(
    await realpath(dirname(requested)),
    basename(requested),
  );
  const fromData = relative(await realpath(input.dataDir), directory);
  if (
    fromData === '' ||
    (!isAbsolute(fromData) &&
      fromData !== '..' &&
      !fromData.startsWith(`..${sep}`))
  ) {
    throw new Error(
      'Timetable export must be outside the canonical data directory',
    );
  }
  const files = {
    'manifest.json': artifact.manifestBytes,
    'timetable.json': artifact.timetableBytes,
    'NOTICE.txt': artifact.noticeBytes,
    'mapping-draft.json': json(draft),
    'mapping-approval.json': json(mappingApproval),
    'release-review.json': json(releaseReview),
    'release.json': json({ ...report, currentTerms }),
  };

  await mkdir(directory);
  try {
    for (const [name, bytes] of Object.entries(files)) {
      await writeFile(join(directory, name), bytes, { flag: 'wx' });
    }
  } catch (error) {
    try {
      await rm(directory, { recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Timetable export failed and could not remove incomplete output: ${directory}`,
      );
    }
    throw error;
  }
  return { exported: true as const, outputDirectory: directory, ...report };
}
