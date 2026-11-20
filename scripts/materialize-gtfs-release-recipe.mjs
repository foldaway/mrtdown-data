import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquirePublicGtfsCapture } from '../packages/cli/dist/gtfsAcquisition.js';
import { decodeRecipe, verifyObject } from './gtfs-release-recipe.mjs';

export async function materializeReleaseRecipe(
  bytes,
  outputDir,
  origin,
  acquire = acquirePublicGtfsCapture,
) {
  const { recipe, files } = decodeRecipe(bytes);
  await mkdir(outputDir);
  try {
    for (const [name, content] of Object.entries(files)) {
      if (name !== 'recipe.json')
        await writeFile(join(outputDir, name), content, { flag: 'wx' });
    }
    const captured = JSON.parse(Buffer.from(files['capture.json']).toString());
    if (captured.sha256 !== recipe.source.sha256)
      throw new Error('Recipe source differs from its capture receipt');
    const acquired = await acquire(
      origin,
      `captures/schedule/${captured.sha256}.json`,
      join(outputDir, 'acquired'),
    );
    verifyObject(await readFile(acquired.file), recipe.source);
    // Keep the originally approved receipt; the shared ZIP bytes are immutable.
    await rename(acquired.file, join(outputDir, 'schedule.zip'));
    await rm(join(outputDir, 'acquired'), { recursive: true, force: true });
    return recipe;
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [file, outputDir] = process.argv.slice(2);
  if (!file || !outputDir)
    throw new Error(
      'Usage: node scripts/materialize-gtfs-release-recipe.mjs <recipe.zip> <new-output-dir>',
    );
  const env = process.env;
  await materializeReleaseRecipe(
    await readFile(file),
    outputDir,
    env.GTFS_SNAPSHOT_BASE_URL,
  );
}
