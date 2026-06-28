import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Manifest,
  ManifestSchema,
  SourceRegistrySchema,
} from '@mrtdown/core';
import {
  type EntityCollection,
  entityCollections,
  rightsDirectory,
  sourceRegistryFileName,
} from './constants.js';
import { listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';
import { readJsonFile } from './json.js';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function collectionManifestKey(
  collection: EntityCollection,
): Exclude<
  keyof Manifest,
  'generatedAt' | 'issues' | 'manifestVersion' | 'rights'
> {
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
    manifestVersion: 2,
    generatedAt,
    lines: {},
    stations: {},
    towns: {},
    landmarks: {},
    operators: {},
    services: {},
    issues: {},
    rights: {
      licenseData: '',
      sourceRegistry: '',
    },
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

  const sourceRegistry = await readJsonFile(
    join(dataDir, rightsDirectory, sourceRegistryFileName),
    SourceRegistrySchema,
  );
  const licenseData = await readOptionalText(join(dataDir, 'LICENSE-DATA.md'));
  manifest.rights.licenseData = sha256(licenseData);
  manifest.rights.sourceRegistry = sha256(sourceRegistry);

  return ManifestSchema.parse(manifest);
}
