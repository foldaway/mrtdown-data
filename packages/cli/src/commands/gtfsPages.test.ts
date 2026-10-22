import { execFile } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ManifestSchema } from '@mrtdown/core';
import {
  hashBytes,
  prepareVerifiedGtfsTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from '@mrtdown/fs';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPagesArtifact } from '../../../../scripts/build-pages-artifact.mjs';
import { reviewedReleaseFixture } from '../../../fs/src/gtfs/__tests__/releaseFixture.js';
import { gtfsLicenceReference } from '../gtfsTerms.js';

const execFileAsync = promisify(execFile);
const fixtureDataDir = resolve('fixtures/generated/data');
const termsText = 'Synthetic terms for Pages integration tests only.';

async function fixture(root: string) {
  await cp(fixtureDataDir, join(root, 'data'), { recursive: true });
  const {
    currentTerms: _terms,
    releaseInstant: _instant,
    releaseReview,
    ...preparation
  } = await reviewedReleaseFixture(root, true);
  preparation.currentLicenceReference = gtfsLicenceReference;
  await mkdir(join(root, 'data/town'), { recursive: true });
  await writeFile(
    join(root, 'data/town/T.json'),
    JSON.stringify({
      id: 'T',
      name: { 'en-SG': 'Synthetic', 'zh-Hans': null, ms: null, ta: null },
    }),
  );
  const captureFile = join(root, 'capture.json');
  const capture = JSON.parse(await readFile(captureFile, 'utf8'));
  capture.attribution = 'Synthetic <script>untrusted attribution</script>';
  await writeFile(captureFile, JSON.stringify(capture));
  const prepared = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    captureFile,
    preparation,
  );
  releaseReview.manifestSha256 = prepared.manifestSha256;
  releaseReview.terms = {
    licence: {
      reference: gtfsLicenceReference,
      sha256: hashBytes(Buffer.from(termsText)),
    },
    apiTerms: {
      reference: releaseReview.terms.apiTerms.reference,
      sha256: hashBytes(Buffer.from(termsText)),
    },
  };
  const config = {
    schemaVersion: 1,
    canonicalCommit: preparation.canonicalCommit,
    mappingVersion: preparation.mappingVersion,
    correctionRevision: preparation.correctionRevision,
    currentLicenceReference: gtfsLicenceReference,
    draft: 'draft.json',
    mappingApproval: 'approval.json',
    releaseReview: 'release-review.json',
  };
  for (const [name, value] of Object.entries({
    'config.json': config,
    'draft.json': preparation.draft,
    'approval.json': preparation.mappingApproval,
    'release-review.json': releaseReview,
  })) {
    await writeFile(join(root, name), JSON.stringify(value));
  }
  await mkdir(join(root, 'data/scheduled-timetable'));
  await writeFile(join(root, 'data/scheduled-timetable/unreviewed.json'), '{}');
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(termsText));
  vi.stubGlobal('fetch', fetcher);
  return {
    config,
    fetcher,
    prepared,
    options: {
      dataDir: preparation.dataDir,
      fixtureDataDir,
      outDir: join(root, 'pages'),
      gtfsFile: join(root, 'schedule.zip'),
      gtfsCapture: captureFile,
      gtfsConfig: join(root, 'config.json'),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Pages scheduled timetable integration', () => {
  it('binds the reviewed bundle into the index and both archives with conspicuous escaped attribution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-pages-'));
    try {
      const { options, prepared, fetcher } = await fixture(root);
      await buildPagesArtifact(options);
      const index = ManifestSchema.parse(
        JSON.parse(
          await readFile(join(options.outDir, 'manifest.json'), 'utf8'),
        ),
      );
      const entry = index.scheduledTimetable;
      expect(entry?.manifestSha256).toBe(prepared.manifestSha256);
      expect(entry?.coverage).toEqual({
        sourceTripDateCount: 2,
        assignedTripDateCount: 2,
        missingTripDateCount: 0,
      });
      const bundle = join(options.outDir, 'scheduled-timetable');
      const manifestBytes = await readFile(join(bundle, 'manifest.json'));
      const releaseBytes = await readFile(join(bundle, 'release.json'));
      expect(hashBytes(releaseBytes)).toBe(entry?.releaseSha256);
      verifyScheduledTimetableArtifact(
        manifestBytes,
        entry?.manifestSha256 ?? '',
        {
          timetableBytes: await readFile(join(bundle, 'timetable.json')),
          noticeBytes: await readFile(join(bundle, 'NOTICE.txt')),
        },
      );
      const html = await readFile(join(options.outDir, 'index.html'), 'utf8');
      expect(html).toContain('LTA-derived scheduled timetable');
      expect(html).toContain(`href="${gtfsLicenceReference}"`);
      const exportsHtml = html.slice(html.indexOf('<h2 id="exports">'));
      expect(
        exportsHtml.indexOf(`href="${gtfsLicenceReference}"`),
      ).toBeLessThan(exportsHtml.indexOf('href="archive.zip"'));
      expect(html).toContain('2026-01-15T00:00:00Z');
      expect(html).toContain('2026-01-01 to 2026-01-07');
      expect(html).toContain('not an official service or live predictions');
      expect(html).not.toContain('<script>untrusted attribution</script>');
      expect(html).toContain('untrusted attribution');
      const zip = unzipSync(
        await readFile(join(options.outDir, 'archive.zip')),
      );
      expect(
        Buffer.from(zip['data/scheduled-timetable/manifest.json']),
      ).toEqual(manifestBytes);
      expect(Buffer.from(zip['data/scheduled-timetable/release.json'])).toEqual(
        releaseBytes,
      );
      const tar = await execFileAsync('tar', [
        '-xOzf',
        join(options.outDir, 'archive.tar.gz'),
        'data/scheduled-timetable/manifest.json',
      ]);
      expect(tar.stdout).toBe(manifestBytes.toString('utf8'));
      expect(zip['data/scheduled-timetable/unreviewed.json']).toBeUndefined();
      expect(
        JSON.parse(
          await readFile(
            join(options.outDir, 'fixtures/manifest.json'),
            'utf8',
          ),
        ).scheduledTimetable,
      ).toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('preserves the previous output when terms, approvals or the concurrently packaged topology do not match', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-pages-blocked-'));
    try {
      const { options, config, fetcher } = await fixture(root);
      await mkdir(options.outDir);
      await writeFile(join(options.outDir, 'keep.txt'), 'Previous output');
      await expect(
        buildPagesArtifact({
          ...options,
          gtfsFile: join(options.outDir, 'schedule.zip'),
        }),
      ).rejects.toThrow('must not contain timetable inputs');
      await expect(
        buildPagesArtifact({ ...options, gtfsCapture: undefined }),
      ).rejects.toThrow('together');
      fetcher.mockImplementation(async () => new Response('Changed terms'));
      await expect(buildPagesArtifact(options)).rejects.toThrow(
        'Release review does not match current terms',
      );
      fetcher.mockImplementation(async () => new Response(termsText));
      await writeFile(
        options.gtfsConfig,
        JSON.stringify({
          ...config,
          mappingApproval: undefined,
          releaseReview: undefined,
        }),
      );
      await expect(buildPagesArtifact(options)).rejects.toThrow(
        'Mapping review is not complete',
      );
      await writeFile(options.gtfsConfig, JSON.stringify(config));
      const stationFile = join(root, 'data/station/S.json');
      const station = JSON.parse(await readFile(stationFile, 'utf8'));
      station.layout.platforms = station.layout.platforms.filter(
        (item: { id: string }) => item.id !== 'C',
      );
      await writeFile(stationFile, JSON.stringify(station));
      await expect(buildPagesArtifact(options)).rejects.toThrow(
        'Timetable publication blocked',
      );
      expect(await readdir(options.outDir)).toEqual(['keep.txt']);
      expect(await readFile(join(options.outDir, 'keep.txt'), 'utf8')).toBe(
        'Previous output',
      );
      expect(
        (await readdir(root)).some((name) => name.startsWith('.pages-build-')),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps default builds offline and omits timetable files and links without explicit release inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-pages-default-'));
    try {
      const { options, fetcher } = await fixture(root);
      await buildPagesArtifact({
        dataDir: options.dataDir,
        fixtureDataDir,
        outDir: options.outDir,
      });
      expect(fetcher).not.toHaveBeenCalled();
      const manifest = JSON.parse(
        await readFile(join(options.outDir, 'manifest.json'), 'utf8'),
      );
      expect(manifest.scheduledTimetable).toBeUndefined();
      expect(
        await readFile(join(options.outDir, 'index.html'), 'utf8'),
      ).not.toContain('scheduled-timetable');
      await expect(
        readdir(join(options.outDir, 'scheduled-timetable')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
