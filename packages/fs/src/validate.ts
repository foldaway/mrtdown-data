import type { z } from 'zod';
import {
  type EntityCollection,
  entityCollections,
  issueDirectory,
} from './constants.js';
import { listEntities } from './entities.js';
import { listIssueBundles } from './issues.js';

export type ValidationScope = EntityCollection | 'issue';

export type ValidationResult = {
  ok: boolean;
  checked: Record<ValidationScope, number>;
  errors: string[];
};

function emptyChecked(): Record<ValidationScope, number> {
  return {
    landmark: 0,
    line: 0,
    operator: 0,
    service: 0,
    station: 0,
    town: 0,
    issue: 0,
  };
}

function formatError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as z.ZodError).issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

export async function validateDataRoot(
  dataDir: string,
  scopes: readonly ValidationScope[] = [...entityCollections, issueDirectory],
): Promise<ValidationResult> {
  const checked = emptyChecked();
  const errors: string[] = [];

  for (const scope of scopes) {
    try {
      if (scope === 'issue') {
        const bundles = await listIssueBundles(dataDir);
        checked.issue = bundles.length;
        continue;
      }

      const records = await listEntities(dataDir, scope);
      checked[scope] = records.length;
    } catch (error) {
      errors.push(`${scope}: ${formatError(error)}`);
    }
  }

  return {
    ok: errors.length === 0,
    checked,
    errors,
  };
}
