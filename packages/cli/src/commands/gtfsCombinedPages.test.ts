import { execFile } from 'node:child_process';
import {
  copyFile,
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
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { verifyCombinedTimetableReleaseBundle } from '@mrtdown/fs';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPagesArtifact } from '../../../../scripts/build-pages-artifact.mjs';
import { prepareHistoricalCombinedTimetableReplay } from '../../../../scripts/export-pages-combined-timetable.mjs';
import {
  combinedPagesFixture,
  combinedReleaseInstant,
  combinedTermsText,
} from './__tests__/combinedPagesFixture.js';

const execFileAsync = promisify(execFile);
const fixtureDataDir =
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
  fileURLToPath(
    new URL('../../../../fixtures/generated/data', import.meta.url),
  );
const indexName = 'combined-timetable-release-index.json';

/** Serve the synthetic terms through the production terms acquisition path. */
async function fixture(settings?: Parameters<typeof combinedPagesFixture>[2]) {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-combined-pages-'));
  roots.push(root);
  const { options, ...fixture } = await combinedPagesFixture(
    root,
    fixtureDataDir,
    settings,
  );
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(combinedTermsText),
  );
  vi.stubGlobal('fetch', fetcher);
  return { root, ...fixture, options: { ...options, fixtureDataDir }, fetcher };
}

const roots: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(combinedReleaseInstant));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Pages combined timetable integration', () => {
  it('regenerates digest-bound reviews and separates historical replay from fresh publication terms', async () => {
    const { root, options, fetcher } = await fixture();
    await buildPagesArtifact(options);
    const index = await readFile(join(options.outDir, indexName));
    const evidence = await readFile(
      join(options.outDir, 'combined-timetable/release.json'),
    );
    const timetable = await readFile(
      join(options.outDir, 'combined-timetable/timetable.json'),
    );
    await writeFile(join(root, 'release-index.json'), index);
    await writeFile(join(root, 'release-evidence.json'), evidence);
    const config = JSON.parse(
      await readFile(options.gtfsCombinedConfig, 'utf8'),
    );
    const draft = JSON.parse(await readFile(join(root, config.draft), 'utf8'));
    delete config.draft;
    config.draftSha256 = draft.draftSha256;
    config.approvedRelease = {
      index: 'release-index.json',
      evidence: 'release-evidence.json',
    };
    await writeFile(options.gtfsCombinedConfig, JSON.stringify(config));
    await rm(join(root, 'draft.json'));
    await buildPagesArtifact(options);
    expect(
      await readFile(join(options.outDir, 'combined-timetable/timetable.json')),
    ).toEqual(timetable);
    expect(fetcher).toHaveBeenCalledTimes(4);

    const replayData = join(root, 'replay-data');
    await import('node:fs/promises').then(({ cp }) =>
      cp(options.dataDir, replayData, { recursive: true }),
    );
    await rm(join(replayData, 'combined-timetable'), { recursive: true });
    fetcher.mockClear();
    fetcher.mockImplementation(
      async () => new Response('Changed current terms'),
    );
    vi.setSystemTime(new Date('2027-03-01T00:00:00Z'));
    const replay = await prepareHistoricalCombinedTimetableReplay(options);
    await replay(replayData);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await readFile(join(replayData, 'combined-timetable/release.json')),
    ).toEqual(evidence);
    expect(
      await readFile(join(replayData, 'combined-timetable/timetable.json')),
    ).toEqual(timetable);
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'publication blocked',
    );

    config.draftSha256 = '0'.repeat(64);
    await writeFile(options.gtfsCombinedConfig, JSON.stringify(config));
    const stale = await prepareHistoricalCombinedTimetableReplay(options);
    await expect(stale(replayData)).rejects.toThrow('approved draft digest');
  }, 30_000);
  it('rejects aliases to excluded source files before replacing the Pages export', async () => {
    const { options, fetcher } = await fixture();
    await mkdir(join(options.dataDir, 'source'));
    await writeFile(
      join(options.dataDir, 'source', 'private.txt'),
      'Private source data',
    );
    await symlink(
      join('source', 'private.txt'),
      join(options.dataDir, 'alias.txt'),
    );
    await mkdir(options.outDir);
    await writeFile(join(options.outDir, 'keep.txt'), 'Previous output');
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'Combined timetable export requires data without symbolic links: alias.txt',
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readdir(options.outDir)).toEqual(['keep.txt']);
  });

  it('requires declared source feed bounds for the site source-order checks', async () => {
    const { options, fetcher } = await fixture({ includeFeedInfo: false });
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'exactly one feed_info.txt record',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('packages the approved service dates and emits the release index outside both archives', async () => {
    const { root, options, topology, manifestSha256, config, fetcher } =
      await fixture({ reviewedBoarding: true });
    await buildPagesArtifact(options);
    const read = (path: string) => readFile(join(options.outDir, path));
    const index = JSON.parse((await read(indexName)).toString('utf8'));
    expect(index.manifestSha256).toBe(manifestSha256);
    const zip = unzipSync(await read('archive.zip'));
    const files = {
      manifestBytes: zip['data/combined-timetable/manifest.json'],
      timetableBytes: zip['data/combined-timetable/timetable.json'],
      releaseBytes: zip['data/combined-timetable/release.json'],
    };
    const verified = verifyCombinedTimetableReleaseBundle(
      index,
      files,
      topology,
    );
    expect(verified.manifest.serviceDateRange).toEqual({
      startDate: '2026-11-01',
      endDateExclusive: '2026-12-01',
    });
    const allocatedPlatforms = Object.values(verified.artifact.patterns)
      .flatMap(({ calls }) => calls)
      .filter(({ stationId }) => stationId === 'D')
      .flatMap(({ platforms }) => platforms);
    expect(allocatedPlatforms).toContainEqual(
      expect.objectContaining({
        platformId: 'platform-D',
        accessByService: expect.arrayContaining([
          expect.objectContaining({
            serviceId: 'SVC',
            passengerBoardingEligible: true,
          }),
        ]),
      }),
    );
    expect(
      Object.keys(zip)
        .filter((name) => name.startsWith('data/combined-timetable/'))
        .sort(),
    ).toEqual([
      'data/combined-timetable/',
      'data/combined-timetable/manifest.json',
      'data/combined-timetable/release.json',
      'data/combined-timetable/timetable.json',
    ]);
    expect(zip[`data/${indexName}`]).toBeUndefined();
    expect((await read('manifest.json')).toString('utf8')).not.toContain(
      index.releaseSha256,
    );
    const tar = join(options.outDir, 'archive.tar.gz');
    const { stdout: listing } = await execFileAsync('tar', ['-tzf', tar]);
    expect(listing).not.toContain(indexName);
    for (const name of ['manifest.json', 'release.json', 'timetable.json']) {
      const path = `combined-timetable/${name}`;
      const { stdout } = await execFileAsync(
        'tar',
        ['-xOzf', tar, `data/${path}`],
        { encoding: 'buffer' },
      );
      expect(stdout).toEqual(Buffer.from(zip[`data/${path}`]));
      expect(await read(path)).toEqual(stdout);
    }
    const html = (await read('index.html')).toString('utf8');
    expect(html).toContain('Synthetic &#x3C;script>attribution&#x3C;/script>');
    expect(html).toContain('from 2026-11-01 up to 2026-12-01 (exclusive)');
    expect(html.indexOf('Supported Singapore service dates')).toBeLessThan(
      html.indexOf('href="archive.zip"'),
    );
    expect(await readdir(join(options.outDir, 'fixtures'))).not.toContain(
      'combined-timetable',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);

    const approvedIndex = join(root, 'release-index.json');
    const approvedEvidence = join(root, 'release-evidence.json');
    await copyFile(join(options.outDir, indexName), approvedIndex);
    await copyFile(
      join(options.outDir, 'combined-timetable/release.json'),
      approvedEvidence,
    );
    await writeFile(
      options.gtfsCombinedConfig,
      JSON.stringify({
        ...config,
        approvedRelease: {
          index: 'release-index.json',
          evidence: 'release-evidence.json',
        },
      }),
    );
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
    await buildPagesArtifact(options);
    expect(await read(indexName)).toEqual(await readFile(approvedIndex));
    expect(await read('combined-timetable/release.json')).toEqual(
      await readFile(approvedEvidence),
    );
    expect(fetcher).toHaveBeenCalledTimes(4);

    const sourceReview = {
      schemaVersion: 1,
      documentKind: 'scheduled-timetable-source-review',
      decision: 'baseline',
      predecessor: null,
      successor: {
        manifestSha256,
        snapshotSha256: verified.manifest.capture.sha256,
      },
      reviewer: 'Synthetic production reviewer',
      reviewedAt: combinedReleaseInstant,
      reason: 'Synthetic baseline against an empty history',
    };
    const payloadPath = join(root, 'pull.json');
    const preparePull = (review: unknown) =>
      execFileAsync(
        process.execPath,
        [
          '--import',
          'data:text/javascript,Date.now=()=>Date.parse("2026-11-12T00:00:00Z")',
          fileURLToPath(
            new URL(
              '../../../../scripts/prepare-pages-site-pull.mjs',
              import.meta.url,
            ),
          ),
          options.outDir,
          approvedIndex,
          payloadPath,
        ],
        {
          env: {
            ...process.env,
            MRTDOWN_COMBINED_TIMETABLE_SOURCE_REVIEW: JSON.stringify(review),
          },
        },
      );
    await expect(
      preparePull({
        ...sourceReview,
        successor: { manifestSha256, snapshotSha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow('Production source review does not bind this release');
    await preparePull(sourceReview);
    expect(JSON.parse(await readFile(payloadPath, 'utf8'))).toEqual({
      combinedReleaseIndex: index,
      sourceReview,
    });

    fetcher.mockImplementation(async () => new Response('Changed terms'));
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'Release review does not match current terms',
    );
    expect(await read(indexName)).toEqual(await readFile(approvedIndex));

    fetcher.mockClear();
    await buildPagesArtifact({
      dataDir: options.dataDir,
      outDir: options.outDir,
      fixtureDataDir,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readdir(options.outDir)).not.toContain(indexName);
    expect(await readdir(options.outDir)).not.toContain('combined-timetable');
  }, 30_000);

  it('keeps the previous artifact when inputs conflict or the combined release no longer matches', async () => {
    const { root, options, config, fetcher } = await fixture();
    await mkdir(options.outDir);
    await writeFile(join(options.outDir, 'keep.txt'), 'Previous output');
    await expect(
      buildPagesArtifact({
        ...options,
        gtfsConfig: options.gtfsCombinedConfig,
      }),
    ).rejects.toThrow('Choose one');
    await expect(
      buildPagesArtifact({ ...options, gtfsCapture: undefined }),
    ).rejects.toThrow('together');
    const previousReview = join(options.outDir, 'releaseReview.json');
    await copyFile(join(root, 'releaseReview.json'), previousReview);
    await writeFile(
      options.gtfsCombinedConfig,
      JSON.stringify({ ...config, releaseReview: previousReview }),
    );
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'must not contain timetable inputs',
    );
    await rm(previousReview);
    await writeFile(options.gtfsCombinedConfig, JSON.stringify(config));

    fetcher.mockImplementation(async () => new Response('Changed terms'));
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'Release review does not match current terms',
    );
    fetcher.mockImplementation(async () => new Response(combinedTermsText));
    const operatorPath = join(options.dataDir, 'operator', 'SBS.json');
    const operator = JSON.parse(await readFile(operatorPath, 'utf8'));
    const linePath = join(options.dataDir, 'line', 'NEL.json');
    const line = JSON.parse(await readFile(linePath, 'utf8'));
    await writeFile(
      join(options.dataDir, 'operator', 'other.json'),
      JSON.stringify({ ...operator, id: 'other' }),
    );
    line.operators[0].operatorId = 'other';
    await writeFile(linePath, JSON.stringify(line));
    await expect(buildPagesArtifact(options)).rejects.toThrow(
      'Shared service claims do not bind this base mapping draft',
    );
    expect(await readdir(options.outDir)).toEqual(['keep.txt']);
    expect(
      (await readdir(root)).some((name) => name.startsWith('.pages-build-')),
    ).toBe(false);
  }, 30_000);
});
