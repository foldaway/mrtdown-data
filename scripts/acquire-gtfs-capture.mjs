import { resolve } from 'node:path';
import { acquirePublicGtfsCapture } from '../packages/cli/dist/gtfsAcquisition.js';

// biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime acquisition is not a cached Turbo task.
const baseUrl = process.env.GTFS_SNAPSHOT_BASE_URL;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime acquisition is not a cached Turbo task.
const captureKey = process.env.GTFS_CAPTURE_KEY;
// biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime acquisition is not a cached Turbo task.
const outputDir = process.env.GTFS_INPUT_DIR;
if (!baseUrl || !captureKey || !outputDir) {
  throw new Error(
    'GTFS_SNAPSHOT_BASE_URL, GTFS_CAPTURE_KEY and GTFS_INPUT_DIR are required',
  );
}
await acquirePublicGtfsCapture(baseUrl, captureKey, resolve(outputDir));
