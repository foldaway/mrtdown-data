import { join } from 'node:path';
import type z from 'zod';
import { DIR_STATION } from '../constants.js';
import type { IStore } from '../repo/common/store.js';
import { StationSchema } from '../schema/Station.js';
import type { ValidationContext, ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateStationSchema(data: unknown): ValidationError[] {
  const result = StationSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateStationRelationships(
  data: z.infer<typeof StationSchema>,
  ctx: ValidationContext,
  file: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!ctx.townIds.has(data.townId)) {
    errors.push({
      file,
      message: `townId "${data.townId}" does not exist`,
    });
  }

  for (const landmarkId of data.landmarkIds) {
    if (!ctx.landmarkIds.has(landmarkId)) {
      errors.push({
        file,
        message: `landmarkIds: "${landmarkId}" does not exist`,
      });
    }
  }

  for (const sc of data.stationCodes) {
    if (!ctx.lineIds.has(sc.lineId)) {
      errors.push({
        file,
        message: `stationCodes[].lineId "${sc.lineId}" does not exist`,
      });
    }
  }

  return errors;
}

export function validateStations(store: IStore): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_STATION);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_STATION, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) {
        errors.push({ file: relPath, message: 'Failed to parse JSON' });
        continue;
      }
      const schemaErrs = validateStationSchema(raw);
      for (const e of schemaErrs) {
        errors.push({ ...e, file: e.file || relPath });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_STATION,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}

export function validateStationsRelationships(
  store: IStore,
  ctx?: ValidationContext,
): ValidationError[] {
  if (!ctx) return [];
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_STATION);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_STATION, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) continue;
      const parsed = StationSchema.safeParse(raw);
      if (parsed.success) {
        errors.push(...validateStationRelationships(parsed.data, ctx, relPath));
      }
    }
  } catch {
    // ignore
  }
  return errors;
}
