import { createHash } from 'node:crypto';
import { type Manifest, ManifestSchema } from '@mrtdown/core';
import { type EntityCollection, entityCollections } from './constants.js';
import { listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function collectionManifestKey(
  collection: EntityCollection,
): Exclude<keyof Manifest, 'generatedAt' | 'issues' | 'manifestVersion'> {
  switch (collection) {
    case 'landmark':
      return 'landmarks';
    case 'line':
      return 'lines';
    case 'operator':
      return 'operators';
    case 'service':
      return 'services';
    case 'station':
      return 'stations';
    case 'town':
      return 'towns';
  }
}

export async function buildManifest(
  dataDir: string,
  generatedAt = new Date().toISOString(),
): Promise<Manifest> {
  const manifest: Manifest = {
    manifestVersion: 1,
    generatedAt,
    lines: {},
    stations: {},
    towns: {},
    landmarks: {},
    operators: {},
    services: {},
    issues: {},
  };

  for (const collection of entityCollections) {
    const key = collectionManifestKey(collection);
    const records = await listEntities(dataDir, collection);
    for (const record of records) {
      manifest[key][record.id] = sha256(record.value);
    }
  }

  for (const bundle of await listIssueBundles(dataDir)) {
    manifest.issues[bundle.issue.id] = sha256(bundle);
  }

  return ManifestSchema.parse(manifest);
}
