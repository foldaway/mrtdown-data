import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import {
  assessScheduledTimetableSourceChange,
  type ScheduledTimetableArtifactManifest,
  ScheduledTimetableArtifactManifestSchema,
  type ScheduledTimetableSourceReview,
  ScheduledTimetableSourceReviewSchema,
} from '@mrtdown/core';
import z from 'zod';
import { verifyScheduledTimetableForCanonicalData } from './canonicalTimetableArtifact.js';
import { hashBytes } from './capture.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const ScheduledTimetableImportRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('scheduled-timetable-import'),
    manifestSha256: digest,
    predecessorSha256: digest.nullable(),
    importInstant: z.iso.datetime({ offset: true }),
    sourceReview: ScheduledTimetableSourceReviewSchema,
  })
  .strict();
export type ScheduledTimetableImportRecord = z.infer<
  typeof ScheduledTimetableImportRecordSchema
>;
export interface RetainedScheduledTimetable {
  manifestSha256: string;
  manifest: ScheduledTimetableArtifactManifest;
  record: ScheduledTimetableImportRecord;
}
export interface ScheduledTimetableArtifactFiles {
  manifestBytes: Uint8Array;
  timetableBytes: Uint8Array;
  noticeBytes: Uint8Array;
}

async function readArtifact(
  directory: string,
): Promise<ScheduledTimetableArtifactFiles> {
  const [manifestBytes, timetableBytes, noticeBytes] = await Promise.all([
    readFile(join(directory, 'manifest.json')),
    readFile(join(directory, 'timetable.json')),
    readFile(join(directory, 'NOTICE.txt')),
  ]);
  return { manifestBytes, timetableBytes, noticeBytes };
}

function sourceArtifact(
  version: Pick<RetainedScheduledTimetable, 'manifestSha256' | 'manifest'>,
) {
  return { manifestSha256: version.manifestSha256, manifest: version.manifest };
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return (
    path === '' ||
    (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
  );
}

/** The store is trusted local state; directory names retain the originally trusted digests. */
export async function readScheduledTimetableHistory(storeDir: string) {
  const versions = new Map<string | null, RetainedScheduledTimetable>();
  for (const entry of await readdir(storeDir, { withFileTypes: true })) {
    if (!digest.safeParse(entry.name).success) {
      continue;
    }
    if (!entry.isDirectory()) {
      throw new Error(`Retained timetable must be a directory: ${entry.name}`);
    }
    const directory = join(storeDir, entry.name);
    const bytes = await readFile(join(directory, 'manifest.json'));
    if (hashBytes(bytes) !== entry.name) {
      throw new Error(
        `Retained timetable manifest does not match its directory: ${entry.name}`,
      );
    }
    const manifest = ScheduledTimetableArtifactManifestSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    const record = ScheduledTimetableImportRecordSchema.parse(
      JSON.parse(await readFile(join(directory, 'import.json'), 'utf8')),
    );
    if (
      record.manifestSha256 !== entry.name ||
      versions.has(record.predecessorSha256)
    ) {
      throw new Error(
        'Retained timetable history has a conflicting identity or predecessor',
      );
    }
    versions.set(record.predecessorSha256, {
      manifestSha256: entry.name,
      manifest,
      record,
    });
  }
  const history: RetainedScheduledTimetable[] = [];
  const seenSources = new Set<string>();
  let predecessor: RetainedScheduledTimetable | undefined;
  while (history.length < versions.size) {
    const next = versions.get(predecessor?.manifestSha256 ?? null);
    if (
      !next ||
      history.some((version) => version.manifestSha256 === next.manifestSha256)
    ) {
      throw new Error('Retained timetable history is incomplete or cyclic');
    }
    if (
      predecessor &&
      Date.parse(next.record.importInstant) <
        Date.parse(predecessor.record.importInstant)
    ) {
      throw new Error(
        'Retained timetable import time precedes its predecessor',
      );
    }
    if (
      seenSources.has(next.manifest.capture.sha256) &&
      predecessor?.manifest.capture.sha256 !== next.manifest.capture.sha256
    ) {
      throw new Error(
        'Retained timetable history reintroduces an older source snapshot',
      );
    }
    const assessment = assessScheduledTimetableSourceChange({
      candidate: sourceArtifact(next),
      incumbent: predecessor ? sourceArtifact(predecessor) : undefined,
      review: next.record.sourceReview,
      importInstant: next.record.importInstant,
    });
    if (!assessment.sourceEligible) {
      throw new Error(
        `Invalid retained timetable source review: ${assessment.blockers.join(', ')}`,
      );
    }
    history.push(next);
    seenSources.add(next.manifest.capture.sha256);
    predecessor = next;
  }
  return history;
}

/** Recheck companion bytes before using a retained version; history reads metadata only. */
export async function readRetainedScheduledTimetable(
  storeDir: string,
  manifestSha256: string,
  options?: { dataDir: string },
) {
  const hash = digest.parse(manifestSha256);
  const version = (await readScheduledTimetableHistory(storeDir)).find(
    (item) => item.manifestSha256 === hash,
  );
  if (!version) {
    throw new Error(`Timetable version is not retained: ${hash}`);
  }
  const files = await readArtifact(join(storeDir, hash));
  const verified = options
    ? await verifyScheduledTimetableForCanonicalData(
        files.manifestBytes,
        hash,
        files,
        options,
      )
    : verifyScheduledTimetableArtifact(files.manifestBytes, hash, files);
  return { ...version, ...verified };
}

/** Callers supply a stable canonical tree, private existing store and trusted review/clock. */
export async function importScheduledTimetableArtifact(
  files: ScheduledTimetableArtifactFiles,
  expectedManifestSha256: string,
  options: {
    storeDir: string;
    dataDir: string;
    importInstant: string;
    sourceReview?: ScheduledTimetableSourceReview;
  },
) {
  const input = structuredClone(options);
  input.importInstant = z.iso
    .datetime({ offset: true })
    .parse(input.importInstant);
  if (input.sourceReview) {
    input.sourceReview = ScheduledTimetableSourceReviewSchema.parse(
      input.sourceReview,
    );
  }
  const bytes = {
    manifestBytes: Buffer.from(files.manifestBytes),
    timetableBytes: Buffer.from(files.timetableBytes),
    noticeBytes: Buffer.from(files.noticeBytes),
  };
  const { manifest } = await verifyScheduledTimetableForCanonicalData(
    bytes.manifestBytes,
    expectedManifestSha256,
    bytes,
    { dataDir: input.dataDir },
  );
  const candidate = { manifestSha256: expectedManifestSha256, manifest };
  const [storeDir, dataDir] = await Promise.all([
    realpath(input.storeDir),
    realpath(input.dataDir),
  ]);
  if (contains(dataDir, storeDir) || contains(storeDir, dataDir)) {
    throw new Error(
      'Timetable store and canonical data directories must not overlap',
    );
  }
  const lock = join(storeDir, '.import-lock');
  await mkdir(lock);
  let staging: string | undefined;
  try {
    const history = await readScheduledTimetableHistory(storeDir);
    const incumbent = history.at(-1);
    const retained = history.find(
      (version) => version.manifestSha256 === expectedManifestSha256,
    );
    const existing = retained ?? incumbent;
    if (existing) {
      const previousFiles = await readArtifact(
        join(storeDir, existing.manifestSha256),
      );
      verifyScheduledTimetableArtifact(
        previousFiles.manifestBytes,
        existing.manifestSha256,
        previousFiles,
      );
    }
    if (retained) {
      return {
        imported: false as const,
        action: 'already-retained' as const,
        version: retained,
      };
    }
    const assessment = assessScheduledTimetableSourceChange({
      candidate: sourceArtifact(candidate),
      incumbent: incumbent ? sourceArtifact(incumbent) : undefined,
      review: input.sourceReview,
      importInstant: input.importInstant,
    });
    const blockers = [...assessment.blockers];
    if (
      incumbent &&
      Date.parse(input.importInstant) <
        Date.parse(incumbent.record.importInstant)
    ) {
      blockers.push('import-time-precedes-predecessor');
    }
    if (
      incumbent?.manifest.capture.sha256 !==
        candidate.manifest.capture.sha256 &&
      history.some(
        (version) =>
          version.manifest.capture.sha256 === candidate.manifest.capture.sha256,
      )
    ) {
      blockers.push('older-source-already-retained');
    }
    if (blockers.length) {
      return { imported: false as const, action: null, blockers };
    }
    const record = ScheduledTimetableImportRecordSchema.parse({
      schemaVersion: 1,
      documentKind: 'scheduled-timetable-import',
      manifestSha256: candidate.manifestSha256,
      predecessorSha256: incumbent?.manifestSha256 ?? null,
      importInstant: input.importInstant,
      sourceReview: input.sourceReview,
    });
    staging = await mkdtemp(join(storeDir, '.pending-'));
    for (const [name, content] of Object.entries({
      'manifest.json': bytes.manifestBytes,
      'timetable.json': bytes.timetableBytes,
      'NOTICE.txt': bytes.noticeBytes,
      'import.json': `${JSON.stringify(record, null, 2)}\n`,
    })) {
      await writeFile(join(staging, name), content, { flag: 'wx' });
    }
    await rename(staging, join(storeDir, candidate.manifestSha256));
    staging = undefined;
    return {
      imported: true as const,
      action: assessment.action,
      version: {
        manifestSha256: candidate.manifestSha256,
        manifest: candidate.manifest,
        record,
      },
    };
  } finally {
    try {
      if (staging) {
        await rm(staging, { recursive: true });
      }
    } finally {
      await rmdir(lock);
    }
  }
}
