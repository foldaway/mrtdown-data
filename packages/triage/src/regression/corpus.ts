import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type RegressionCase,
  RegressionCaseSchema,
  type RegressionFailureLabel,
} from './case.js';

export const DEFAULT_REGRESSION_CORPUS_DIR = resolve(
  import.meta.dirname,
  '../../../../fixtures/triage-regressions',
);

export interface RegressionCaseFilters {
  caseId?: string;
  label?: RegressionFailureLabel;
}

export function loadRegressionCorpus(
  corpusDir = DEFAULT_REGRESSION_CORPUS_DIR,
): RegressionCase[] {
  const paths = readdirSync(corpusDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => resolve(corpusDir, entry.name))
    .sort();

  const cases = paths.map((path) => {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return RegressionCaseSchema.parse(value);
  });

  const seenIds = new Set<string>();
  for (const regressionCase of cases) {
    if (seenIds.has(regressionCase.id)) {
      throw new Error(`Duplicate regression case id: ${regressionCase.id}`);
    }
    seenIds.add(regressionCase.id);
  }

  return cases.sort((left, right) => left.id.localeCompare(right.id));
}

export function filterRegressionCases(
  cases: RegressionCase[],
  filters: RegressionCaseFilters,
): RegressionCase[] {
  return cases.filter((regressionCase) => {
    if (filters.caseId != null && regressionCase.id !== filters.caseId) {
      return false;
    }
    if (
      filters.label != null &&
      !regressionCase.labels.includes(filters.label)
    ) {
      return false;
    }
    return true;
  });
}

export function formatRegressionCaseSummary(
  regressionCase: RegressionCase,
): string {
  const pr =
    regressionCase.source.kind === 'pull-request'
      ? `PR #${regressionCase.source.number}`
      : 'commit';
  return [
    regressionCase.id,
    `[${regressionCase.role}]`,
    `${pr}:`,
    `${regressionCase.observed.outcome.kind} → ${regressionCase.expected.outcome.kind}`,
    `(${regressionCase.labels.join(', ')})`,
  ].join(' ');
}
