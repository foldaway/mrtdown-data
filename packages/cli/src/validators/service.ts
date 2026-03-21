import { join } from 'node:path';
import { ServiceSchema } from '@mrtdown/core';
import { DIR_SERVICE, type IStore } from '@mrtdown/fs';
import type z from 'zod';
import type { ValidationContext, ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateServiceSchema(data: unknown): ValidationError[] {
  const result = ServiceSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateServiceRelationships(
  data: z.infer<typeof ServiceSchema>,
  ctx: ValidationContext,
  file: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!ctx.lineIds.has(data.lineId)) {
    errors.push({
      file,
      message: `lineId "${data.lineId}" does not exist`,
    });
  }

  for (const rev of data.revisions) {
    for (const st of rev.path.stations) {
      if (!ctx.stationIds.has(st.stationId)) {
        errors.push({
          file,
          message: `revisions[].path.stations[].stationId "${st.stationId}" does not exist`,
        });
      }
    }
  }

  return errors;
}

export function validateServices(store: IStore): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_SERVICE);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_SERVICE, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) {
        errors.push({ file: relPath, message: 'Failed to parse JSON' });
        continue;
      }
      const schemaErrs = validateServiceSchema(raw);
      for (const e of schemaErrs) {
        errors.push({ ...e, file: e.file || relPath });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_SERVICE,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}

export function validateServicesRelationships(
  store: IStore,
  ctx?: ValidationContext,
): ValidationError[] {
  if (!ctx) return [];
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_SERVICE);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_SERVICE, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) continue;
      const parsed = ServiceSchema.safeParse(raw);
      if (parsed.success) {
        errors.push(...validateServiceRelationships(parsed.data, ctx, relPath));
      }
    }
  } catch {
    // ignore
  }
  return errors;
}
