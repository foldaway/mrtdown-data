import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScheduledTimetableSourceReview } from '@mrtdown/core';
import {
  prepareScheduledTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from '../timetableArtifact.js';
import { importScheduledTimetableArtifact } from '../timetableStore.js';
import { prepareVerifiedGtfsTimetableArtifact } from '../verifiedTimetableArtifact.js';
import { artifactFixture } from './artifactFixture.js';

type Artifact = ReturnType<typeof prepareScheduledTimetableArtifact>;
export function sourceReview(
  decision: ScheduledTimetableSourceReview['decision'],
  successor: Artifact,
  predecessor?: Artifact,
): ScheduledTimetableSourceReview {
  const identity = (artifact: Artifact) => ({
    manifestSha256: artifact.manifestSha256,
    snapshotSha256: artifact.manifest.capture.sha256,
  });
  return {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-source-review',
    decision,
    predecessor: predecessor ? identity(predecessor) : null,
    successor: identity(successor),
    reviewer: 'Synthetic importer reviewer',
    reviewedAt: '2026-01-20T00:00:00Z',
    reason: 'Synthetic source-order review; no real release is approved.',
  };
}
export async function timetableStoreFixture(
  root: string,
  overrides: Record<string, string> = {},
) {
  const { options } = await artifactFixture(root, true, overrides);
  const first = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    options,
  );
  const { timetable } = verifyScheduledTimetableArtifact(
    first.manifestBytes,
    first.manifestSha256,
    first,
  );
  const {
    timetable: _timetable,
    notice: _notice,
    ...metadata
  } = first.manifest;
  const corrected = prepareScheduledTimetableArtifact(timetable, {
    ...metadata,
    correctionRevision: 2,
  });
  const successor = prepareScheduledTimetableArtifact(timetable, {
    ...metadata,
    capture: { ...metadata.capture, sha256: 'b'.repeat(64) },
  });
  const storeDir = join(root, 'store');
  await mkdir(storeDir);
  const settings = {
    storeDir,
    dataDir: options.dataDir,
    importInstant: '2026-01-20T00:00:00Z',
  };
  const run = (
    artifact: Artifact,
    sourceReview?: ScheduledTimetableSourceReview,
  ) =>
    importScheduledTimetableArtifact(artifact, artifact.manifestSha256, {
      ...settings,
      sourceReview,
    });
  return {
    root,
    settings,
    first,
    corrected,
    successor,
    run,
    timetable,
    metadata,
  };
}
