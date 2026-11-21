import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { ScheduledTimetableSourceReviewSchema } from '@mrtdown/core';
import { hashBytes, readVerifiedCapture } from '../packages/fs/dist/index.js';
import { combinedPagesConfigSchema } from './export-pages-combined-timetable.mjs';
import {
  deterministicZip,
  objectDescriptor,
  recipeSchema,
  releaseId,
  revisionArchive,
  sha256Schema,
} from './gtfs-release-inputs.mjs';
import { replayReleaseRecipe } from './gtfs-release-replay.mjs';

export {
  decodeRecipe,
  deterministicZip,
  extractRevision,
  objectDescriptor,
  recipeSchema,
  releaseId,
  revisionArchive,
  verifyObject,
} from './gtfs-release-inputs.mjs';
export {
  replayReleaseRecipe,
  runRetainedGenerator,
} from './gtfs-release-replay.mjs';

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

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
  // Preserve the exact lineage authorization for later redeployments. Older
  // manual recipes continue to use the protected environment's review.
  try {
    await retainFile('source-review.json', 'source-review.json');
    const review = ScheduledTimetableSourceReviewSchema.parse(
      JSON.parse(files['source-review.json'].toString()),
    );
    const index = await json(await inputPath(config.approvedRelease.index));
    if (
      review.successor.snapshotSha256 !== capture.sha256 ||
      review.successor.manifestSha256 !== index.manifestSha256
    )
      throw new Error(
        'Retained source review differs from the approved release',
      );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (config.draft) {
    const saved = await json(await inputPath(config.draft));
    compact.draftSha256 = sha256Schema.parse(saved.draftSha256);
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
