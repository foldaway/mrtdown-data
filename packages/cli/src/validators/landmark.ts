import { join } from 'node:path';
import { LandmarkSchema } from '@mrtdown/core';
import { DIR_LANDMARK, type IStore } from '@mrtdown/fs';
import type { ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateLandmarkSchema(
  data: unknown,
): { file: string; message: string }[] {
  const result = LandmarkSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateLandmarks(store: IStore): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_LANDMARK);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_LANDMARK, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) {
        errors.push({ file: relPath, message: 'Failed to parse JSON' });
        continue;
      }
      const schemaErrs = validateLandmarkSchema(raw);
      for (const e of schemaErrs) {
        errors.push({ ...e, file: e.file || relPath });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_LANDMARK,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}
