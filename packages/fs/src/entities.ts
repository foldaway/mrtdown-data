import { readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  type Landmark,
  LandmarkSchema,
  type Line,
  LineSchema,
  type Operator,
  OperatorSchema,
  type Service,
  ServiceSchema,
  type Station,
  StationSchema,
  type Town,
  TownSchema,
} from '@mrtdown/core';
import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollectionDirectories,
} from './constants.js';
import { readJsonFile, writeJsonFile } from './json.js';
import { toDataPath } from './paths.js';

export type EntityByCollection = {
  landmark: Landmark;
  line: Line;
  operator: Operator;
  service: Service;
  station: Station;
  town: Town;
};

const entitySchemas: {
  [K in EntityCollection]: z.ZodType<EntityByCollection[K]>;
} = {
  landmark: LandmarkSchema,
  line: LineSchema,
  operator: OperatorSchema,
  service: ServiceSchema,
  station: StationSchema,
  town: TownSchema,
};

export type EntityRecord<K extends EntityCollection = EntityCollection> = {
  collection: K;
  id: string;
  path: string;
  value: EntityByCollection[K];
};

export function entityPath(
  dataDir: string,
  collection: EntityCollection,
  id: string,
): string {
  return join(dataDir, entityCollectionDirectories[collection], `${id}.json`);
}

async function listJsonFiles(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(path, entry.name))
      .sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function listEntityIds(
  dataDir: string,
  collection: EntityCollection,
): Promise<string[]> {
  const dir = join(dataDir, entityCollectionDirectories[collection]);
  const files = await listJsonFiles(dir);
  return files.map((file) => basename(file, '.json'));
}

export async function readEntity<K extends EntityCollection>(
  dataDir: string,
  collection: K,
  id: string,
): Promise<EntityRecord<K>> {
  const path = entityPath(dataDir, collection, id);
  return {
    collection,
    id,
    path: toDataPath(relative(dataDir, path)),
    value: await readJsonFile(path, entitySchemas[collection]),
  };
}

export async function listEntities<K extends EntityCollection>(
  dataDir: string,
  collection: K,
): Promise<EntityRecord<K>[]> {
  const ids = await listEntityIds(dataDir, collection);
  return Promise.all(ids.map((id) => readEntity(dataDir, collection, id)));
}

export async function writeEntity<K extends EntityCollection>(
  dataDir: string,
  collection: K,
  value: EntityByCollection[K],
): Promise<string> {
  const parsed = entitySchemas[collection].parse(value);
  const path = entityPath(dataDir, collection, parsed.id);
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}

export async function writeUnknownEntity(
  dataDir: string,
  collection: EntityCollection,
  value: unknown,
): Promise<string> {
  const parsed = entitySchemas[collection].parse(value);
  const path = entityPath(dataDir, collection, parsed.id);
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}
