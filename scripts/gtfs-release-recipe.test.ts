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
import {
  prepareCombinedTimetableExport,
  prepareHistoricalCombinedTimetableReplay,
} from './export-pages-combined-timetable.mjs';
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
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture({
  retainedDraftSha256,
}: {
  retainedDraftSha256?: string;
} = {}) {
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
  const approvedDraft = JSON.parse(
    await readFile(join(root, config.draft), 'utf8'),
  );
  const pagesConfig: Record<string, unknown> = {
    ...config,
    approvedRelease: {
      index: 'release-index.json',
      evidence: 'release-evidence.json',
    },
  };
  if (retainedDraftSha256) {
    delete pagesConfig.draft;
    pagesConfig.draftSha256 = retainedDraftSha256;
  }
  await writeFile(
    join(root, 'combined-pages.json'),
    JSON.stringify(pagesConfig),
  );
  const code = join(root, 'code');
  await mkdir(code);
  // A real, self-contained archived generator: install/build/execute it in the
  // worker, rather than silently using this checkout's exporter in the tests.
  const pkg = {
    name: 'retained-generator-fixture',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      preinstall: 'node -e "throw new Error(\'install scripts must not run\')"',
      'build:cli': 'node build.mjs',
    },
  };
  const lock = Buffer.from(
    JSON.stringify({
      name: pkg.name,
      version: pkg.version,
      lockfileVersion: 3,
      packages: { '': { name: pkg.name, version: pkg.version } },
    }),
  );
  await writeFile(join(code, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(code, 'package-lock.json'), lock);
  await writeFile(
    join(code, 'build.mjs'),
    `
    import { writeFile } from 'node:fs/promises';
    if (process.env.AWS_SECRET_ACCESS_KEY || process.env.OPENAI_API_KEY) throw new Error('Publisher credentials leaked');
    if (process.env.TZ !== 'UTC') throw new Error('Unnormalized replay timezone');
    await writeFile('build-complete.json', JSON.stringify({ version: 'retained-v1' }));
  `,
  );
  await mkdir(join(code, 'scripts'));
  await mkdir(join(code, 'approved-output'));
  for (const name of ['manifest.json', 'timetable.json', 'release.json'])
    await cp(
      join(staged, 'combined-timetable', name),
      join(code, 'approved-output', name),
    );
  await writeFile(
    join(code, 'approved-output/release-index.json'),
    JSON.stringify(index),
  );
  await writeFile(
    join(code, 'expected-inputs.json'),
    JSON.stringify({
      capture: JSON.parse(await readFile(options.gtfsCapture, 'utf8')),
      sourceSha256: hashBytes(await readFile(options.gtfsFile)),
      draftSha256: retainedDraftSha256 ?? approvedDraft.draftSha256,
      canonicalCommit: config.canonicalCommit,
      index,
    }),
  );
  await writeFile(
    join(code, 'scripts/export-pages-combined-timetable.mjs'),
    await readFile(
      new URL(
        './__tests__/retained-generator/export-pages-combined-timetable.mjs',
        import.meta.url,
      ),
    ),
  );
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
  const generator = archive(code, [
    'package.json',
    'package-lock.json',
    'build.mjs',
    'expected-inputs.json',
    'scripts',
    'approved-output',
  ]);
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

test('compact recipes omit generated reviews/source copies and run the retained generator without fetching terms', async () => {
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
}, 30_000);

test('executes the archived exporter when the current exporter cannot reproduce the approved draft', async () => {
  const { root, options } = await fixture({
    retainedDraftSha256: hashBytes(Buffer.from('retained-v1-approved-draft')),
  });
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'synthetic-publisher-key');
  vi.stubEnv('OPENAI_API_KEY', 'synthetic-unneeded-key');
  const prepared = await prepareReleaseRecipe(options);
  const { files } = decodeRecipe(prepared.recipeBytes);
  const materialized = join(root, 'changed-contract');
  const dataDir = join(root, 'current-replay-data');
  await mkdir(materialized);
  for (const [name, bytes] of Object.entries(files))
    if (name !== 'recipe.json')
      await writeFile(join(materialized, name), bytes);
  await cp(join(root, 'schedule.zip'), join(materialized, 'schedule.zip'));
  await cp(join(root, 'data'), dataDir, { recursive: true });
  const current = await prepareHistoricalCombinedTimetableReplay({
    gtfsFile: join(materialized, 'schedule.zip'),
    gtfsCapture: join(materialized, 'capture.json'),
    gtfsCombinedConfig: join(materialized, 'combined-pages.json'),
    outDir: join(root, 'unused-current-output'),
  });
  await expect(current(dataDir)).rejects.toThrow('approved draft digest');
  const result = await replayReleaseRecipe(
    deterministicZip(files),
    async (key: string) => prepared.objects.get(key),
  );
  expect(result.outputs).toEqual(prepared.record.outputs);
}, 30_000);

test.each([
  'source',
  'capture',
  'config',
] as const)('the archived exporter validates the supplied %s input instead of blindly returning approved outputs', async (kind) => {
  const { options } = await fixture();
  const prepared = await prepareReleaseRecipe(options);
  const { recipe, files } = decodeRecipe(prepared.recipeBytes);
  const objects = new Map(prepared.objects);
  if (kind === 'source') {
    const bytes = Buffer.from('different schedule bytes');
    const sha256 = hashBytes(bytes);
    recipe.source = {
      key: `sources/${sha256}.zip`,
      sha256,
      byteLength: bytes.length,
    };
    objects.set(recipe.source.key, bytes);
  } else {
    const name = kind === 'capture' ? 'capture.json' : 'combined-pages.json';
    const value = JSON.parse(Buffer.from(files[name]).toString());
    if (kind === 'capture') value.attribution = 'Different receipt';
    else value.draftSha256 = 'f'.repeat(64);
    files[name] = Buffer.from(JSON.stringify(value));
    recipe.files[name] = {
      sha256: hashBytes(files[name]),
      byteLength: files[name].length,
    };
  }
  files['recipe.json'] = Buffer.from(JSON.stringify(recipe));
  await expect(
    replayReleaseRecipe(deterministicZip(files), async (key: string) =>
      objects.get(key),
    ),
  ).rejects.toThrow(`Retained fixture ${kind} differs`);
}, 30_000);

test('ZIP bytes are identical across UTC, Singapore and Los Angeles and preserve the original UTC format', () => {
  const source = `import {deterministicZip} from ${JSON.stringify(
    new URL('./gtfs-release-recipe.mjs', import.meta.url).href,
  )}; import {createHash} from 'node:crypto'; console.log(createHash('sha256').update(deterministicZip({'file.json':Buffer.from('{}')})).digest('hex'));`;
  const hashes = ['UTC', 'Asia/Singapore', 'America/Los_Angeles'].map((TZ) =>
    execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
      env: { ...process.env, TZ },
      encoding: 'utf8',
    }).trim(),
  );
  const bytes = deterministicZip({ 'file.json': Buffer.from('{}') });
  expect(new Set(hashes).size).toBe(1);
  expect(hashes[0]).toBe(hashBytes(bytes));
  expect(hashes[0]).toBe(
    '358ab2a22010199ce425425d9f915cc0e0940cbaaa04601a76588f8a1afc1c62',
  );
});

test('preserves the exact source admission review in future automatic redeployments', async () => {
  const { root, options, index } = await fixture();
  const sourceReview = {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-source-review',
    decision: 'baseline',
    predecessor: null,
    successor: {
      manifestSha256: index.manifestSha256,
      snapshotSha256: JSON.parse(
        await readFile(join(root, 'capture.json'), 'utf8'),
      ).sha256,
    },
    reviewer: 'Fixture reviewer',
    reviewedAt: combinedReleaseInstant,
    reason: 'Synthetic source admission',
  };
  await writeFile(
    join(root, 'source-review.json'),
    JSON.stringify(sourceReview),
  );
  const prepared = await prepareReleaseRecipe(options);
  const { files } = decodeRecipe(prepared.recipeBytes);
  expect(
    JSON.parse(Buffer.from(files['source-review.json']).toString()),
  ).toEqual(sourceReview);
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
