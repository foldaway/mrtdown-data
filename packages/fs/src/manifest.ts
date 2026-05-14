import { join, relative } from 'node:path';
import { type Manifest, ManifestSchema } from '@mrtdown/core';
import {
  type EntityCollection,
  entityCollectionDirectories,
  entityCollections,
  issueDirectory,
} from './constants.js';
import { listEntityIds } from './entities.js';
import { issueDatePathPartsFromId, listIssueIds } from './issues.js';
import { toDataPath } from './paths.js';

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
    const ids = await listEntityIds(dataDir, collection);
    for (const id of ids) {
      manifest[key][id] = toDataPath(
        relative(
          dataDir,
          join(dataDir, entityCollectionDirectories[collection], `${id}.json`),
        ),
      );
    }
  }

  for (const id of await listIssueIds(dataDir)) {
    const { year, month } = issueDatePathPartsFromId(id);
    manifest.issues[id] = toDataPath(
      join(issueDirectory, year, month, id, 'issue.json'),
    );
  }

  return ManifestSchema.parse(manifest);
}
