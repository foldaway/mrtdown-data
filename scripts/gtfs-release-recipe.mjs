import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';
import z from 'zod';
import {
  CombinedTimetableReleaseIndexSchema,
  hashBytes,
  readVerifiedCapture,
} from '../packages/fs/dist/index.js';
import {
  combinedPagesConfigSchema,
  prepareHistoricalCombinedTimetableReplay,
} from './export-pages-combined-timetable.mjs';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const descriptor = z
  .object({
    key: z.string().min(1),
    sha256: digest,
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
export const recipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-release-recipe'),
    releaseIndex: CombinedTimetableReleaseIndexSchema,
    canonicalCommit: z.string().regex(/^[a-f0-9]{40}$/),
    generatorCommit: z.string().regex(/^[a-f0-9]{40}$/),
    packageLockSha256: digest,
    nodeVersion: z.string().min(1),
    source: descriptor,
    canonical: descriptor,
    generator: descriptor,
    files: z.record(
      z.string(),
      z
        .object({ sha256: digest, byteLength: z.number().int().nonnegative() })
        .strict(),
    ),
  })
  .strict();
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const releaseId = (index) =>
  hashBytes(
    Buffer.from(
      JSON.stringify(CombinedTimetableReleaseIndexSchema.parse(index)),
    ),
  );
export const objectDescriptor = (kind, bytes, extension) => ({
  key: `${kind}/${hashBytes(bytes)}.${extension}`,
  sha256: hashBytes(bytes),
  byteLength: bytes.length,
});
export function verifyObject(bytes, expected) {
  if (
    bytes.length !== expected.byteLength ||
    hashBytes(bytes) !== expected.sha256
  )
    throw new Error(
      `Retained object hash/size mismatch: ${expected.key ?? 'recipe file'}`,
    );
  return bytes;
}
export function deterministicZip(files) {
  return Buffer.from(
    zipSync(files, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') }),
  );
}
export function revisionArchive(repo, revision, paths) {
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error('Expected full Git revision');
  return gzipSync(
    execFileSync('git', ['archive', '--format=tar', revision, ...paths], {
      cwd: repo,
      maxBuffer: 128 * 1024 * 1024,
    }),
    { level: 9 },
  );
}
/** Only extract verified Git-produced tar archives; reject aliases/traversal first. */
export function extractRevision(bytes, directory) {
  const tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const string = (start, length) =>
      header
        .subarray(start, start + length)
        .toString()
        .split('\0')[0];
    const name = [string(345, 155), string(0, 100)].filter(Boolean).join('/');
    const type = string(156, 1);
    const size = Number.parseInt(string(124, 12).trim() || '0', 8);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      isAbsolute(name) ||
      name.split('/').includes('..') ||
      name.includes('\\') ||
      !['', '0', '5', 'g'].includes(type)
    )
      throw new Error('Unsafe retained revision archive');
    if (
      type === 'g' &&
      !/^\d+ comment=[a-f0-9]{40}\n$/.test(
        tar.subarray(offset + 512, offset + 512 + size).toString(),
      )
    )
      throw new Error('Unsafe retained Git archive metadata');
    offset += 512 + Math.ceil(size / 512) * 512;
    if (offset > tar.length)
      throw new Error('Truncated retained revision archive');
  }
  execFileSync(
    'tar',
    ['-xf', '-', '-C', directory, '--no-same-owner', '--no-same-permissions'],
    { input: tar },
  );
}
export function decodeRecipe(bytes) {
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (!/^[A-Za-z][A-Za-z0-9-]*\.json$/.test(file.name))
        throw new Error('Unsafe recipe entry');
      expanded += file.originalSize;
      if (expanded > 16 * 1024 * 1024)
        throw new Error('Recipe exceeds expanded size limit');
      return true;
    },
  });
  const recipe = recipeSchema.parse(
    JSON.parse(Buffer.from(files['recipe.json'] ?? []).toString()),
  );
  const expectedNames = [...Object.keys(recipe.files), 'recipe.json'].sort();
  if (
    JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(expectedNames)
  )
    throw new Error('Recipe file inventory differs');
  for (const [name, expected] of Object.entries(recipe.files))
    verifyObject(files[name], expected);
  return { recipe, files };
}

/** Replay only retained evidence at its original instant; this never authorizes publication. */
export async function replayReleaseRecipe(recipeBytes, getObject) {
  const { recipe, files } = decodeRecipe(recipeBytes);
  const root = await mkdtemp(join(tmpdir(), 'gtfs-release-replay-'));
  try {
    const inputs = join(root, 'inputs');
    const canonical = join(root, 'canonical');
    await mkdir(inputs);
    await mkdir(canonical);
    for (const [name, bytes] of Object.entries(files))
      if (name !== 'recipe.json')
        await writeFile(join(inputs, name), bytes, { flag: 'wx' });
    const source = verifyObject(
      await getObject(recipe.source.key),
      recipe.source,
    );
    const canonicalBytes = verifyObject(
      await getObject(recipe.canonical.key),
      recipe.canonical,
    );
    const generatorBytes = verifyObject(
      await getObject(recipe.generator.key),
      recipe.generator,
    );
    // Verify that the saved generator includes the exact dependency lock.
    const code = join(root, 'generator');
    await mkdir(code);
    extractRevision(generatorBytes, code);
    if (
      hashBytes(await readFile(join(code, 'package-lock.json'))) !==
      recipe.packageLockSha256
    )
      throw new Error('Retained generator dependency lock differs');
    extractRevision(canonicalBytes, canonical);
    await writeFile(join(inputs, 'schedule.zip'), source, { flag: 'wx' });
    const exporter = await prepareHistoricalCombinedTimetableReplay({
      gtfsFile: join(inputs, 'schedule.zip'),
      gtfsCapture: join(inputs, 'capture.json'),
      gtfsCombinedConfig: join(inputs, 'combined-pages.json'),
      outDir: join(root, 'unused-publication-output'),
    });
    const { index, manifest } = await exporter(join(canonical, 'data'));
    if (releaseId(index) !== releaseId(recipe.releaseIndex))
      throw new Error('Replayed release index differs from the recipe');
    const bundleFiles = { 'release-index.json': jsonBytes(index) };
    for (const name of ['manifest.json', 'timetable.json', 'release.json'])
      bundleFiles[name] = await readFile(
        join(canonical, 'data', 'combined-timetable', name),
      );
    const outputs = Object.fromEntries(
      Object.entries(bundleFiles).map(([name, bytes]) => [
        name,
        { sha256: hashBytes(bytes), byteLength: bytes.length },
      ]),
    );
    return {
      recipe,
      manifest,
      bundleFiles,
      outputs,
      replay: {
        schemaVersion: 1,
        documentKind: 'gtfs-release-replay-proof',
        releaseId: releaseId(index),
        recipeSha256: hashBytes(recipeBytes),
        sourceSha256: recipe.source.sha256,
        canonicalSha256: recipe.canonical.sha256,
        generatorSha256: recipe.generator.sha256,
        outputs,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Turn legacy saved drafts into compact immutable policy recipes, after exact replay. */
export async function prepareReleaseRecipe({
  inputDir,
  repo,
  generatorCommit,
  snapshots,
}) {
  const config = combinedPagesConfigSchema.parse(
    await json(join(inputDir, 'combined-pages.json')),
  );
  if (!config.approvedRelease)
    throw new Error('Only approved releases can be retained');
  const { capture, bytes: source } = await readVerifiedCapture(
    join(inputDir, 'schedule.zip'),
    join(inputDir, 'capture.json'),
  );
  const files = { 'capture.json': jsonBytes(capture) };
  async function inputPath(name) {
    const path = resolve(inputDir, name);
    const rel = relative(await realpath(inputDir), await realpath(path));
    if (
      isAbsolute(rel) ||
      rel === '..' ||
      rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
      (await lstat(path)).isSymbolicLink() ||
      !(await lstat(path)).isFile()
    )
      throw new Error(
        'Recipe inputs must be regular files inside the input directory',
      );
    return path;
  }
  async function retainFile(name, target) {
    const path = await inputPath(name);
    files[target] = await readFile(path);
    return target;
  }
  const compact = { ...config };
  if (config.draft) {
    const saved = await json(await inputPath(config.draft));
    compact.draftSha256 = digest.parse(saved.draftSha256);
    delete compact.draft;
  }
  for (const key of [
    'applicabilityPolicy',
    'associationPolicy',
    'sourceJourneyPolicy',
    'allocationPolicy',
    'holidayPolicy',
    'sharedServiceMemberships',
    'mappingApproval',
    'releaseReview',
  ]) {
    if (config[key])
      compact[key] = await retainFile(config[key], `${key}.json`);
  }
  compact.approvedRelease = {
    index: await retainFile(config.approvedRelease.index, 'release-index.json'),
    evidence: await retainFile(
      config.approvedRelease.evidence,
      'release-evidence.json',
    ),
  };
  files['combined-pages.json'] = jsonBytes(compact);
  const canonicalBytes =
    snapshots?.canonical ??
    revisionArchive(repo, config.canonicalCommit, [
      'data/operator',
      'data/line',
      'data/service',
      'data/station',
      'data/public-holiday',
    ]);
  const generatorBytes =
    snapshots?.generator ??
    revisionArchive(repo, generatorCommit, [
      'package.json',
      'package-lock.json',
      'turbo.json',
      'packages',
      'scripts',
    ]);
  const sourceRef = objectDescriptor('sources', source, 'zip');
  const canonicalRef = objectDescriptor('canonical', canonicalBytes, 'tar.gz');
  const generatorRef = objectDescriptor('generators', generatorBytes, 'tar.gz');
  const recipe = recipeSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-release-recipe',
    releaseIndex: JSON.parse(files['release-index.json'].toString()),
    canonicalCommit: config.canonicalCommit,
    generatorCommit,
    nodeVersion: process.version,
    packageLockSha256: hashBytes(
      snapshots?.packageLock ??
        execFileSync('git', ['show', `${generatorCommit}:package-lock.json`], {
          cwd: repo,
        }),
    ),
    source: sourceRef,
    canonical: canonicalRef,
    generator: generatorRef,
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        { sha256: hashBytes(bytes), byteLength: bytes.length },
      ]),
    ),
  });
  const recipeBytes = deterministicZip({
    ...files,
    'recipe.json': jsonBytes(recipe),
  });
  const recipeRef = objectDescriptor('recipes', recipeBytes, 'zip');
  const objects = new Map([
    [sourceRef.key, source],
    [canonicalRef.key, canonicalBytes],
    [generatorRef.key, generatorBytes],
    [recipeRef.key, recipeBytes],
  ]);
  const replayed = await replayReleaseRecipe(recipeBytes, async (key) => {
    if (!objects.has(key)) throw new Error('Missing retained object');
    return objects.get(key);
  });
  const bundleBytes = deterministicZip(replayed.bundleFiles);
  const id = releaseId(recipe.releaseIndex);
  const record = {
    schemaVersion: 1,
    documentKind: 'gtfs-retained-release',
    releaseId: id,
    releaseIndex: recipe.releaseIndex,
    recipe: recipeRef,
    inputs: [sourceRef, canonicalRef, generatorRef],
    replay: replayed.replay,
    outputs: replayed.outputs,
    bundle: {
      ...objectDescriptor('bundles', bundleBytes, 'zip'),
      key: `bundles/${id}.zip`,
    },
  };
  return { record, objects, bundleBytes, recipeBytes, replayed };
}
