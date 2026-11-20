import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashBytes } from '../packages/fs/dist/index.js';
import { prepareReleaseRecipe, releaseId } from './gtfs-release-recipe.mjs';
import {
  alreadyRetainedRelease,
  retainPreparedRelease,
  s3ReleaseStore,
} from './gtfs-release-store.mjs';

/** Retain only a release independently identified by the published index. */
export async function retainPublishedRelease({
  inputDir,
  publishedIndex,
  store,
  repo,
  outputDir,
}) {
  await mkdir(outputDir);
  const config = JSON.parse(
    await readFile(resolve(inputDir, 'combined-pages.json'), 'utf8'),
  );
  if (!config.approvedRelease)
    throw new Error('Retention requires approved release evidence');
  const approvedIndex = JSON.parse(
    await readFile(resolve(inputDir, config.approvedRelease.index), 'utf8'),
  );
  if (releaseId(approvedIndex) !== releaseId(publishedIndex))
    throw new Error('Published index does not match retained release inputs');
  const incumbent = await store.read('index.json');
  const current = incumbent
    ? JSON.parse(incumbent.bytes.toString()).current
    : null;
  const cached = await alreadyRetainedRelease(store, publishedIndex);
  const generatorCommit = cached
    ? null
    : execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
  // Replay and verify before writes. No generated review or timetable is retained
  // in the recipe; only the two ready bundles are materialized in object storage.
  const prepared = cached
    ? {
        record: cached.record,
        recipeBytes: cached.recipeBytes,
        bundleBytes: { length: cached.record.bundle.byteLength },
      }
    : await prepareReleaseRecipe({
        inputDir,
        repo,
        generatorCommit,
      });
  const result = cached
    ? {
        current: cached.current,
        previous: cached.previous,
        action: cached.action,
        pruned: [],
      }
    : await retainPreparedRelease(store, prepared, current);
  await writeFile(resolve(outputDir, 'recipe.zip'), prepared.recipeBytes, {
    flag: 'wx',
  });
  await writeFile(
    resolve(outputDir, 'record.json'),
    `${JSON.stringify(prepared.record, null, 2)}\n`,
    { flag: 'wx' },
  );
  const receipt = {
    ...result,
    recipeSha256: hashBytes(prepared.recipeBytes),
    recipeBytes: prepared.recipeBytes.length,
    readyBundleBytes: prepared.bundleBytes.length,
  };
  await writeFile(
    resolve(outputDir, 'retention-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx' },
  );
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [inputDir, indexFile, outputDir] = process.argv.slice(2);
  if (!inputDir || !indexFile || !outputDir)
    throw new Error(
      'Usage: node scripts/retain-gtfs-release.mjs <approved-input-dir> <published-index.json> <new-receipt-dir>',
    );
  const env = process.env;
  const store = s3ReleaseStore({ bucket: env.GTFS_RELEASE_RETENTION_BUCKET });
  const result = await retainPublishedRelease({
    inputDir,
    publishedIndex: JSON.parse(await readFile(indexFile, 'utf8')),
    store,
    repo: resolve(import.meta.dirname, '..'),
    outputDir,
  });
  console.log(JSON.stringify(result));
}
