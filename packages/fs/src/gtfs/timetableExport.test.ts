import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import { reviewedReleaseFixture } from './__tests__/releaseFixture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import {
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';
import { exportGtfsTimetableRelease } from './timetableExport.js';
import { gtfsTimetableMappingApprovalSha256 } from './timetableRelease.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile: vi.fn(original.writeFile) };
});

async function readJson(directory: string, name: string) {
  return JSON.parse(await readFile(join(directory, name), 'utf8'));
}

describe('reviewed timetable export', () => {
  it('writes verifiable bytes and the bound reviews, including deliberate coverage exclusions, for both mapping formats', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-export-'));
    try {
      for (const grouped of [false, true]) {
        const options = await reviewedReleaseFixture(root, grouped, (draft) => {
          if (!grouped) {
            return;
          }
          const pattern = draft.decisions.find(
            (item) => item.kind === 'pattern',
          );
          if (pattern?.kind !== 'pattern') {
            throw new Error('Missing synthetic pattern');
          }
          const excluded = {
            ...pattern,
            disposition: 'excluded' as const,
            dateSetId: scopedReviewDateSetId(['2026-01-02']),
            reason: 'Synthetic reviewed exclusion.',
          };
          delete excluded.target;
          pattern.dateSetId = scopedReviewDateSetId(['2026-01-01']);
          draft.dateSets = [
            { id: pattern.dateSetId, serviceDates: ['2026-01-01'] },
            { id: excluded.dateSetId, serviceDates: ['2026-01-02'] },
          ];
          draft.decisions.push(excluded);
        });
        const directory = join(root, `bundle-${grouped}`);
        const result = await exportGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          directory,
          options,
        );
        expect(result.exported).toBe(true);
        expect((await readdir(directory)).sort()).toEqual([
          'NOTICE.txt',
          'manifest.json',
          'mapping-approval.json',
          'mapping-draft.json',
          'release-review.json',
          'release.json',
          'timetable.json',
        ]);
        const verified = verifyScheduledTimetableArtifact(
          await readFile(join(directory, 'manifest.json')),
          result.manifestSha256,
          {
            timetableBytes: await readFile(join(directory, 'timetable.json')),
            noticeBytes: await readFile(join(directory, 'NOTICE.txt')),
          },
        );
        const draft = await readJson(directory, 'mapping-draft.json');
        expect(
          grouped
            ? groupedScopedReviewDraftSha256(draft)
            : scopedReviewDraftSha256(draft),
        ).toBe(verified.manifest.mapping.draftSha256);
        expect(
          gtfsTimetableMappingApprovalSha256(
            await readJson(directory, 'mapping-approval.json'),
          ),
        ).toBe(result.release.mappingApprovalSha256);
        expect(await readJson(directory, 'release-review.json')).toEqual(
          options.releaseReview,
        );
        expect(await readJson(directory, 'release.json')).toMatchObject({
          manifestSha256: result.manifestSha256,
          release: result.release,
          review: result.review,
          coverage: { missingTripDateCount: grouped ? 1 : 0 },
          currentTerms: options.currentTerms,
        });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('leaves no output for blocked or invalid releases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-export-blocked-'));
    try {
      const directory = join(root, 'bundle');
      const run = (options: Parameters<typeof exportGtfsTimetableRelease>[3]) =>
        exportGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          directory,
          options,
        );
      const { options } = await artifactFixture(root);
      const missing = await run({
        ...options,
        releaseInstant: '2026-01-20T00:00:00Z',
      });
      expect(missing.exported).toBe(false);
      expect(missing.release.blockers).toContain(
        'Mapping review is not complete',
      );
      const changed = await reviewedReleaseFixture(root);
      changed.currentTerms.apiTerms.sha256 = '3'.repeat(64);
      const result = await run(changed);
      expect(result.exported).toBe(false);
      expect(result.release.blockers).toContain(
        'Release review does not match current terms',
      );
      await writeFile(join(root, 'schedule.zip'), 'damaged source');
      await expect(run(changed)).rejects.toThrow();
      await expect(readdir(directory)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves existing destinations and refuses output inside canonical data, including through a parent symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-export-destination-'));
    try {
      const options = await reviewedReleaseFixture(root);
      const run = (directory: string) =>
        exportGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          directory,
          options,
        );
      const directory = join(root, 'existing');
      await mkdir(directory);
      await writeFile(join(directory, 'keep.txt'), 'keep');
      await expect(run(directory)).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readdir(directory)).toEqual(['keep.txt']);
      expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('keep');
      const alias = join(root, 'data-link');
      await symlink(options.dataDir, alias, 'dir');
      for (const parent of [options.dataDir, alias]) {
        await expect(run(join(parent, 'bundle'))).rejects.toThrow(
          'outside the canonical data directory',
        );
      }
      await expect(
        readdir(join(options.dataDir, 'bundle')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes its incomplete directory after a file write fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-export-failure-'));
    try {
      const options = await reviewedReleaseFixture(root);
      const directory = join(root, 'bundle');
      const original =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      vi.mocked(writeFile)
        .mockImplementationOnce(original.writeFile)
        .mockRejectedValueOnce(new Error('Synthetic disk failure'));
      await expect(
        exportGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          directory,
          options,
        ),
      ).rejects.toThrow('Synthetic disk failure');
      await expect(readdir(directory)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      vi.mocked(writeFile).mockReset();
      const original =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      vi.mocked(writeFile).mockImplementation(original.writeFile);
      await rm(root, { recursive: true, force: true });
    }
  });
});
