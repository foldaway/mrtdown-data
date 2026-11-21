import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, test, vi } from 'vitest';
import {
  combinedPagesFixture,
  combinedReleaseInstant,
  combinedTermsText,
} from '../packages/cli/src/commands/__tests__/combinedPagesFixture.js';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import { prepareCombinedTimetableExport } from './export-pages-combined-timetable.mjs';
import {
  decodeRecipe,
  deterministicZip,
  extractRevision,
  prepareReleaseRecipe,
  replayReleaseRecipe,
  revisionArchive,
} from './gtfs-release-recipe.mjs';
import { materializeReleaseRecipe } from './materialize-gtfs-release-recipe.mjs';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-recipe-'));
  roots.push(root);
  const { options, config } = await combinedPagesFixture(
    root,
    resolve('fixtures/generated/data'),
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(combinedReleaseInstant));
  const fetcher = vi.fn(async () => new Response(combinedTermsText));
  vi.stubGlobal('fetch', fetcher);
  const staged = join(root, 'staged');
  await cp(options.dataDir, staged, { recursive: true });
  await rm(join(staged, 'combined-timetable'), { recursive: true });
  const exporter = await prepareCombinedTimetableExport(options);
  const { index } = await exporter(staged);
  await writeFile(join(root, 'release-index.json'), JSON.stringify(index));
  await cp(
    join(staged, 'combined-timetable/release.json'),
    join(root, 'release-evidence.json'),
  );
  await writeFile(
    join(root, 'combined-pages.json'),
    JSON.stringify({
      ...config,
      approvedRelease: {
        index: 'release-index.json',
        evidence: 'release-evidence.json',
      },
    }),
  );
  const code = join(root, 'code');
  await mkdir(code);
  const lock = Buffer.from('{"lockfileVersion":3}');
  await writeFile(join(code, 'package-lock.json'), lock);
  const archive = (directory: string, paths: string[]) =>
    gzipSync(
      execFileSync('tar', [
        '--format=ustar',
        '--no-xattrs',
        '-cf',
        '-',
        '-C',
        directory,
        ...paths,
      ]),
    );
  const canonical = archive(root, [
    'data/operator',
    'data/line',
    'data/service',
    'data/station',
    'data/public-holiday',
  ]);
  const generator = archive(code, ['package-lock.json']);
  fetcher.mockClear();
  fetcher.mockRejectedValue(new Error('Offline replay must not fetch'));
  return {
    root,
    options: {
      inputDir: root,
      repo: '.',
      generatorCommit: 'b'.repeat(40),
      snapshots: { canonical, generator, packageLock: lock },
    },
    fetcher,
    index,
  };
}

test('compact recipes omit generated reviews/source copies and replay the approved release without network access', async () => {
  const { options, fetcher, index } = await fixture();
  const prepared = await prepareReleaseRecipe(options);
  expect(prepared.record.releaseIndex).toEqual(index);
  const { recipe, files } = decodeRecipe(prepared.recipeBytes);
  expect(files['schedule.zip']).toBeUndefined();
  expect(files['draft.json']).toBeUndefined();
  expect(
    JSON.parse(Buffer.from(files['combined-pages.json']).toString()),
  ).toMatchObject({ draftSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const replay = await replayReleaseRecipe(
    prepared.recipeBytes,
    async (key: string) => prepared.objects.get(key),
  );
  expect(replay.outputs).toEqual(prepared.record.outputs);
  expect(hashBytes(replay.bundleFiles['manifest.json'])).toBe(
    recipe.releaseIndex.manifestSha256,
  );
  expect(hashBytes(replay.bundleFiles['release.json'])).toBe(
    recipe.releaseIndex.releaseSha256,
  );
  expect(fetcher).not.toHaveBeenCalled();
});

test('tampered source and recipe bytes cannot acquire a successful replay proof', async () => {
  const { options } = await fixture();
  const prepared = await prepareReleaseRecipe(options);
  await expect(
    replayReleaseRecipe(prepared.recipeBytes, async () =>
      Buffer.from('tampered'),
    ),
  ).rejects.toThrow('hash/size mismatch');
  const { files } = decodeRecipe(prepared.recipeBytes);
  files['capture.json'] = Buffer.from('{}');
  expect(() => decodeRecipe(deterministicZip(files))).toThrow(
    'hash/size mismatch',
  );
  expect(() =>
    decodeRecipe(deterministicZip({ '../escape.json': Buffer.from('{}') })),
  ).toThrow('Unsafe recipe');
});

test('materialization uses shared verified source bytes and preserves the original approved receipt', async () => {
  const { root, options } = await fixture();
  const prepared = await prepareReleaseRecipe(options);
  const output = join(root, 'materialized');
  const acquire = async (_origin: string, _key: string, directory: string) => {
    await mkdir(directory);
    await cp(join(root, 'schedule.zip'), join(directory, 'schedule.zip'));
    await writeFile(
      join(directory, 'capture.json'),
      '{"different":"acquisition receipt"}',
    );
    return {
      file: join(directory, 'schedule.zip'),
      handoff: join(directory, 'capture.json'),
    };
  };
  await materializeReleaseRecipe(
    prepared.recipeBytes,
    output,
    'https://sources.example.com',
    acquire,
  );
  expect(
    JSON.parse(await readFile(join(output, 'capture.json'), 'utf8')),
  ).toEqual(JSON.parse(await readFile(join(root, 'capture.json'), 'utf8')));
  expect(await readFile(join(output, 'schedule.zip'))).toEqual(
    await readFile(join(root, 'schedule.zip')),
  );
  await expect(
    materializeReleaseRecipe(
      prepared.recipeBytes,
      output,
      'https://sources.example.com',
      acquire,
    ),
  ).rejects.toThrow('EEXIST');
  const failed = join(root, 'failed');
  await expect(
    materializeReleaseRecipe(
      prepared.recipeBytes,
      failed,
      'https://sources.example.com',
      async () => {
        throw new Error('Download failed');
      },
    ),
  ).rejects.toThrow('Download failed');
  await expect(readFile(join(failed, 'combined-pages.json'))).rejects.toThrow(
    'ENOENT',
  );
});

test('revision snapshots preserve Git metadata and reject symbolic-link entries before extraction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-revision-'));
  roots.push(root);
  const repo = resolve('.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const archive = revisionArchive(repo, commit, [
    'package.json',
    'package-lock.json',
  ]);
  extractRevision(archive, root);
  expect(await readFile(join(root, 'package.json'))).toEqual(
    execFileSync('git', ['show', `${commit}:package.json`]),
  );
  const bad = join(root, 'bad');
  await mkdir(bad);
  await import('node:fs/promises').then(({ symlink }) =>
    symlink('/tmp', join(bad, 'alias')),
  );
  const tar = execFileSync('tar', ['-cf', '-', '-C', bad, 'alias']);
  expect(() => extractRevision(gzipSync(tar), root)).toThrow(
    'Unsafe retained revision',
  );
});
