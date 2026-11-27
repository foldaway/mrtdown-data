import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { CombinedTimetableReleaseIndexSchema } from '../packages/fs/dist/index.js';
import {
  assertBootstrapAllowed,
  checkReleaseTransition,
  materializeReleaseDefinition,
  readReleaseDefinition,
} from './gtfs-release-definition.mjs';
import {
  currentRetainedRelease,
  s3ReleaseStore,
} from './gtfs-release-store.mjs';
import { materializeReleaseRecipe } from './materialize-gtfs-release-recipe.mjs';

/** Permit retrying only the exact reviewed desired release after an interrupted handoff. */
export async function assertPublishedBaseline(
  index,
  fetcher = fetch,
  desiredIndex = null,
) {
  const response = await fetcher(
    'https://data.mrtdown.org/combined-timetable-release-index.json',
    {
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    },
  );
  if (!response.ok)
    throw new Error('Cannot verify the currently public release');
  const published = CombinedTimetableReleaseIndexSchema.parse(
    await response.json(),
  );
  if (
    !isDeepStrictEqual(published, index) &&
    !isDeepStrictEqual(published, desiredIndex)
  )
    throw new Error(
      'Public release differs from the completed and reviewed desired releases. Resolve the unfinished publication before proceeding.',
    );
  return isDeepStrictEqual(published, index) ? 'completed' : 'desired-pending';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [outputDir, definitionPath] = process.argv.slice(2);
  if (!outputDir) throw new Error('Expected a new input directory');
  const env = process.env;
  const current = await currentRetainedRelease(
    s3ReleaseStore({ bucket: env.GTFS_RELEASE_RETENTION_BUCKET }),
  );
  const desired = definitionPath
    ? await readReleaseDefinition(definitionPath)
    : null;
  if (desired) {
    checkReleaseTransition(desired, current.record.releaseIndex, {
      policyBytes: await readFile(
        'docs/gtfs/operations/automatic-publication-policy.json',
      ),
    });
    const publicState = await assertPublishedBaseline(
      current.record.releaseIndex,
      fetch,
      desired.releaseIndex,
    );
    if (publicState === 'desired-pending')
      console.log(
        'Retrying the exact reviewed release already visible on Pages',
      );
    await materializeReleaseDefinition(
      desired,
      outputDir,
      env.GTFS_SNAPSHOT_BASE_URL,
    );
  } else {
    await assertPublishedBaseline(current.record.releaseIndex);
    if (definitionPath) assertBootstrapAllowed('.', definitionPath);
    await materializeReleaseRecipe(
      current.recipeBytes,
      outputDir,
      env.GTFS_SNAPSHOT_BASE_URL,
    );
    if (definitionPath && env.GITHUB_STEP_SUMMARY)
      await writeFile(
        env.GITHUB_STEP_SUMMARY,
        'GTFS bootstrap: no release definition has been merged yet. Reusing the completed release; the next qualifying capture review will establish releases/gtfs.json.\n',
        { flag: 'a' },
      );
  }
  // Bootstrap recipes predate automatic source reviews.
  try {
    await readFile(join(outputDir, 'source-review.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!env.MRTDOWN_COMBINED_TIMETABLE_SOURCE_REVIEW)
      throw new Error('The bootstrap source review is required');
    await writeFile(
      join(outputDir, 'source-review.json'),
      env.MRTDOWN_COMBINED_TIMETABLE_SOURCE_REVIEW,
      { flag: 'wx', mode: 0o600 },
    );
  }
}
