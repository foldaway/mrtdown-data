import { join } from 'node:path';
import type { IStore } from '#repo/common/store.js';
import { TownSchema } from '#schema/Town.js';
import { DIR_TOWN } from '../constants.js';
import type { ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateTownSchema(
  data: unknown,
): { file: string; message: string }[] {
  const result = TownSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateTowns(store: IStore): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_TOWN);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_TOWN, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) {
        errors.push({ file: relPath, message: 'Failed to parse JSON' });
        continue;
      }
      const schemaErrs = validateTownSchema(raw);
      for (const e of schemaErrs) {
        errors.push({ ...e, file: e.file || relPath });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_TOWN,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}
