import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releaseId,
  replayReleaseRecipe,
  verifyObject,
} from './gtfs-release-recipe.mjs';
import { s3ReleaseStore } from './gtfs-release-store.mjs';

export async function rebuildRetainedRelease(store, id, outputDir) {
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Error('Expected a retained release identity');
  await mkdir(outputDir);
  const stored = await store.read(`records/${id}.json`);
  if (!stored) throw new Error('Retained release record not found');
  const record = JSON.parse(stored.bytes.toString());
  if (record.releaseId !== id || releaseId(record.releaseIndex) !== id)
    throw new Error('Retained release identity differs');
  const recipe = await store.read(record.recipe.key);
  if (!recipe) throw new Error('Retained recipe not found');
  verifyObject(recipe.bytes, record.recipe);
  const result = await replayReleaseRecipe(recipe.bytes, async (key) => {
    const object = await store.read(key);
    if (!object) throw new Error(`Missing retained input: ${key}`);
    return object.bytes;
  });
  if (result.replay.releaseId !== id)
    throw new Error('Rebuilt release identity differs');
  for (const [name, bytes] of Object.entries(result.bundleFiles))
    await writeFile(resolve(outputDir, name), bytes, { flag: 'wx' });
  await writeFile(
    resolve(outputDir, 'replay-proof.json'),
    `${JSON.stringify(result.replay, null, 2)}\n`,
    { flag: 'wx' },
  );
  return result.replay;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [id, outputDir] = process.argv.slice(2);
  if (!id || !outputDir)
    throw new Error(
      'Usage: node scripts/rebuild-gtfs-release.mjs <release-id> <new-output-dir>',
    );
  const env = process.env;
  console.log(
    JSON.stringify(
      await rebuildRetainedRelease(
        s3ReleaseStore({ bucket: env.GTFS_RELEASE_RETENTION_BUCKET }),
        id,
        outputDir,
      ),
    ),
  );
}
