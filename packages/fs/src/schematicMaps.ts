import { readdir } from 'node:fs/promises';
import { basename, join, posix, relative } from 'node:path';
import {
  type SchematicMapConstraintSet,
  SchematicMapConstraintSetSchema,
  type SchematicMapEffectiveDate,
  SchematicMapEffectiveDateSchema,
  type SchematicMapLayoutEngineId,
  SchematicMapLayoutEngineIdSchema,
  type SchematicMapManifest,
  SchematicMapManifestSchema,
  type SchematicMapRuleSet,
  SchematicMapRuleSetSchema,
  type SchematicMapVersionSnapshot,
  SchematicMapVersionSnapshotSchema,
} from '@mrtdown/core';
import type { z } from 'zod';
import {
  DIR_SCHEMATIC_MAP,
  DIR_SCHEMATIC_MAP_CONSTRAINT,
  DIR_SCHEMATIC_MAP_ENGINE,
  DIR_SCHEMATIC_MAP_GENERATOR,
  DIR_SCHEMATIC_MAP_VERSION,
  DIR_SCHEMATIC_SYSTEM_MAP,
  FILE_SCHEMATIC_MAP_MANIFEST,
} from './constants.js';
import { readJsonFile, writeJsonFile } from './json.js';
import { toDataPath } from './paths.js';

export type SchematicMapRecord<T> = {
  path: string;
  value: T;
};

export function schematicSystemMapRootPath(): string {
  return posix.join(DIR_SCHEMATIC_MAP, DIR_SCHEMATIC_SYSTEM_MAP);
}

export function schematicSystemMapManifestPath(): string {
  return posix.join(schematicSystemMapRootPath(), FILE_SCHEMATIC_MAP_MANIFEST);
}

export function schematicSystemMapRuleSetPath(
  layoutEngineId: SchematicMapLayoutEngineId,
): string {
  const parsedLayoutEngineId =
    SchematicMapLayoutEngineIdSchema.parse(layoutEngineId);
  return posix.join(
    schematicSystemMapRootPath(),
    DIR_SCHEMATIC_MAP_GENERATOR,
    DIR_SCHEMATIC_MAP_ENGINE,
    `${parsedLayoutEngineId}.json`,
  );
}

export function schematicSystemMapConstraintSetPath(
  effectiveDate: SchematicMapEffectiveDate,
): string {
  const parsedEffectiveDate =
    SchematicMapEffectiveDateSchema.parse(effectiveDate);
  return posix.join(
    schematicSystemMapRootPath(),
    DIR_SCHEMATIC_MAP_GENERATOR,
    DIR_SCHEMATIC_MAP_CONSTRAINT,
    `${parsedEffectiveDate}.json`,
  );
}

export function schematicSystemMapVersionSnapshotPath(
  effectiveDate: SchematicMapEffectiveDate,
): string {
  const parsedEffectiveDate =
    SchematicMapEffectiveDateSchema.parse(effectiveDate);
  return posix.join(
    schematicSystemMapRootPath(),
    DIR_SCHEMATIC_MAP_VERSION,
    `${parsedEffectiveDate}.json`,
  );
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

function schematicMapRecord<T>(
  dataDir: string,
  path: string,
  value: T,
): SchematicMapRecord<T> {
  return {
    path: toDataPath(relative(dataDir, path)),
    value,
  };
}

async function readSchematicMapJson<T>(
  dataDir: string,
  relativePath: string,
  schema: z.ZodType<T>,
): Promise<SchematicMapRecord<T>> {
  const path = join(dataDir, relativePath);
  return schematicMapRecord(dataDir, path, await readJsonFile(path, schema));
}

export async function readSchematicMapManifest(
  dataDir: string,
): Promise<SchematicMapRecord<SchematicMapManifest>> {
  return readSchematicMapJson(
    dataDir,
    schematicSystemMapManifestPath(),
    SchematicMapManifestSchema,
  );
}

export async function writeSchematicMapManifest(
  dataDir: string,
  manifest: SchematicMapManifest,
): Promise<string> {
  const parsed = SchematicMapManifestSchema.parse(manifest);
  const path = join(dataDir, schematicSystemMapManifestPath());
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}

export async function readSchematicMapRuleSet(
  dataDir: string,
  layoutEngineId: SchematicMapLayoutEngineId = 'lta-system-map-2011',
): Promise<SchematicMapRecord<SchematicMapRuleSet>> {
  return readSchematicMapJson(
    dataDir,
    schematicSystemMapRuleSetPath(layoutEngineId),
    SchematicMapRuleSetSchema,
  );
}

export async function writeSchematicMapRuleSet(
  dataDir: string,
  ruleSet: SchematicMapRuleSet,
): Promise<string> {
  const parsed = SchematicMapRuleSetSchema.parse(ruleSet);
  const path = join(
    dataDir,
    schematicSystemMapRuleSetPath(parsed.layoutEngineId),
  );
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}

export async function listSchematicMapConstraintSetEffectiveDates(
  dataDir: string,
): Promise<SchematicMapEffectiveDate[]> {
  const dir = join(
    dataDir,
    schematicSystemMapRootPath(),
    DIR_SCHEMATIC_MAP_GENERATOR,
    DIR_SCHEMATIC_MAP_CONSTRAINT,
  );
  const files = await listJsonFiles(dir);
  return files.map((file) =>
    SchematicMapEffectiveDateSchema.parse(basename(file, '.json')),
  );
}

export async function readSchematicMapConstraintSet(
  dataDir: string,
  effectiveDate: SchematicMapEffectiveDate,
): Promise<SchematicMapRecord<SchematicMapConstraintSet>> {
  return readSchematicMapJson(
    dataDir,
    schematicSystemMapConstraintSetPath(effectiveDate),
    SchematicMapConstraintSetSchema,
  );
}

export async function listSchematicMapConstraintSets(
  dataDir: string,
): Promise<SchematicMapRecord<SchematicMapConstraintSet>[]> {
  const effectiveDates =
    await listSchematicMapConstraintSetEffectiveDates(dataDir);
  return Promise.all(
    effectiveDates.map((effectiveDate) =>
      readSchematicMapConstraintSet(dataDir, effectiveDate),
    ),
  );
}

export async function writeSchematicMapConstraintSet(
  dataDir: string,
  constraintSet: SchematicMapConstraintSet,
): Promise<string> {
  const parsed = SchematicMapConstraintSetSchema.parse(constraintSet);
  const path = join(
    dataDir,
    schematicSystemMapConstraintSetPath(parsed.effectiveDate),
  );
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}

export async function listSchematicMapVersionSnapshotEffectiveDates(
  dataDir: string,
): Promise<SchematicMapEffectiveDate[]> {
  const dir = join(
    dataDir,
    schematicSystemMapRootPath(),
    DIR_SCHEMATIC_MAP_VERSION,
  );
  const files = await listJsonFiles(dir);
  return files.map((file) =>
    SchematicMapEffectiveDateSchema.parse(basename(file, '.json')),
  );
}

export async function readSchematicMapVersionSnapshot(
  dataDir: string,
  effectiveDate: SchematicMapEffectiveDate,
): Promise<SchematicMapRecord<SchematicMapVersionSnapshot>> {
  return readSchematicMapJson(
    dataDir,
    schematicSystemMapVersionSnapshotPath(effectiveDate),
    SchematicMapVersionSnapshotSchema,
  );
}

export async function listSchematicMapVersionSnapshots(
  dataDir: string,
): Promise<SchematicMapRecord<SchematicMapVersionSnapshot>[]> {
  const effectiveDates =
    await listSchematicMapVersionSnapshotEffectiveDates(dataDir);
  return Promise.all(
    effectiveDates.map((effectiveDate) =>
      readSchematicMapVersionSnapshot(dataDir, effectiveDate),
    ),
  );
}

export async function writeSchematicMapVersionSnapshot(
  dataDir: string,
  snapshot: SchematicMapVersionSnapshot,
): Promise<string> {
  const parsed = SchematicMapVersionSnapshotSchema.parse(snapshot);
  const path = join(
    dataDir,
    schematicSystemMapVersionSnapshotPath(parsed.effectiveDate),
  );
  await writeJsonFile(path, parsed);
  return toDataPath(relative(dataDir, path));
}
