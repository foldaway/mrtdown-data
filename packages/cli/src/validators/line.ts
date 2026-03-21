import { join } from 'node:path';
import { LineSchema } from '@mrtdown/core';
import { DIR_LINE, type IStore } from '@mrtdown/fs';
import type z from 'zod';
import type { ValidationContext, ValidationError } from './types.js';
import { loadJson } from './utils.js';

export function validateLineSchema(data: unknown): ValidationError[] {
  const result = LineSchema.safeParse(data);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    file: '',
    message: `${i.path.length > 0 ? i.path.join('.') : 'root'}: ${i.message}`,
  }));
}

export function validateLineRelationships(
  data: z.infer<typeof LineSchema>,
  ctx: ValidationContext,
  file: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const op of data.operators) {
    if (!ctx.operatorIds.has(op.operatorId)) {
      errors.push({
        file,
        message: `operators[].operatorId "${op.operatorId}" does not exist`,
      });
    }
  }

  for (const serviceId of data.serviceIds) {
    if (!ctx.serviceIds.has(serviceId)) {
      errors.push({
        file,
        message: `serviceIds: "${serviceId}" does not exist`,
      });
    }
  }

  return errors;
}

export function validateLines(store: IStore): ValidationError[] {
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_LINE);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_LINE, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) {
        errors.push({ file: relPath, message: 'Failed to parse JSON' });
        continue;
      }
      const schemaErrs = validateLineSchema(raw);
      for (const e of schemaErrs) {
        errors.push({ ...e, file: e.file || relPath });
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        file: DIR_LINE,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return errors;
}

export function validateLinesRelationships(
  store: IStore,
  ctx?: ValidationContext,
): ValidationError[] {
  if (!ctx) return [];
  const errors: ValidationError[] = [];
  try {
    const files = store.listDir(DIR_LINE);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const relPath = join(DIR_LINE, file);
      const raw = loadJson<unknown>(store, relPath);
      if (raw === null) continue;
      const parsed = LineSchema.safeParse(raw);
      if (parsed.success) {
        errors.push(...validateLineRelationships(parsed.data, ctx, relPath));
      }
    }
  } catch {
    // ignore
  }
  return errors;
}
