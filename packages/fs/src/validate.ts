import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollections,
  issueDirectory,
} from './constants.js';
import { type EntityRecord, listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';

export type ValidationScope = EntityCollection | 'issue';

export type ValidationResult = {
  ok: boolean;
  checked: Record<ValidationScope, number>;
  errors: string[];
};

function emptyChecked(): Record<ValidationScope, number> {
  return Object.fromEntries(
    [...entityCollections, issueDirectory].map((scope) => [scope, 0]),
  ) as Record<ValidationScope, number>;
}

function formatError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as z.ZodError).issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

function shouldValidateScope(
  scopes: readonly ValidationScope[],
  scope: ValidationScope,
): boolean {
  return scopes.includes(scope);
}

async function loadLineIds(
  dataDir: string,
  loadedLines: EntityRecord<'line'>[] | undefined,
): Promise<Set<string>> {
  const lines = loadedLines ?? (await listEntities(dataDir, 'line'));
  return new Set(lines.map((line) => line.value.id));
}

async function validateLineReferences(
  dataDir: string,
  scopes: readonly ValidationScope[],
  records: Partial<{
    line: EntityRecord<'line'>[];
    service: EntityRecord<'service'>[];
    station: EntityRecord<'station'>[];
  }>,
): Promise<string[]> {
  if (
    !shouldValidateScope(scopes, 'service') &&
    !shouldValidateScope(scopes, 'station')
  ) {
    return [];
  }

  const lineIds = await loadLineIds(dataDir, records.line);
  const errors: string[] = [];

  if (shouldValidateScope(scopes, 'service')) {
    for (const service of records.service ?? []) {
      if (!lineIds.has(service.value.lineId)) {
        errors.push(
          `${service.path}: lineId ${service.value.lineId} does not exist in line/`,
        );
      }
    }
  }

  if (shouldValidateScope(scopes, 'station')) {
    for (const station of records.station ?? []) {
      for (const [index, stationCode] of station.value.stationCodes.entries()) {
        if (!lineIds.has(stationCode.lineId)) {
          errors.push(
            `${station.path}: stationCodes.${index}.lineId ${stationCode.lineId} does not exist in line/`,
          );
        }
      }
    }
  }

  return errors;
}

export async function validateDataRoot(
  dataDir: string,
  scopes: readonly ValidationScope[] = [...entityCollections, issueDirectory],
): Promise<ValidationResult> {
  const checked = emptyChecked();
  const errors: string[] = [];
  const records: Partial<{
    line: EntityRecord<'line'>[];
    service: EntityRecord<'service'>[];
    station: EntityRecord<'station'>[];
  }> = {};

  for (const scope of scopes) {
    try {
      if (scope === 'issue') {
        const bundles = await listIssueBundles(dataDir);
        checked.issue = bundles.length;
        continue;
      }

      if (scope === 'line') {
        const scopeRecords = await listEntities(dataDir, 'line');
        checked.line = scopeRecords.length;
        records.line = scopeRecords;
        continue;
      }

      if (scope === 'service') {
        const scopeRecords = await listEntities(dataDir, 'service');
        checked.service = scopeRecords.length;
        records.service = scopeRecords;
        continue;
      }

      if (scope === 'station') {
        const scopeRecords = await listEntities(dataDir, 'station');
        checked.station = scopeRecords.length;
        records.station = scopeRecords;
        continue;
      }

      const scopeRecords = await listEntities(dataDir, scope);
      checked[scope] = scopeRecords.length;
    } catch (error) {
      errors.push(`${scope}: ${formatError(error)}`);
    }
  }

  try {
    errors.push(...(await validateLineReferences(dataDir, scopes, records)));
  } catch (error) {
    errors.push(`line: ${formatError(error)}`);
  }

  return {
    ok: errors.length === 0,
    checked,
    errors,
  };
}
