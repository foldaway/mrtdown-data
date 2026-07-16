import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  Claim,
  Evidence,
  ImpactEvent,
  Issue,
  IssueBundle,
} from '@mrtdown/core';
import { FileStore, IdGenerator, MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import {
  type ExtractClaimsFromNewEvidenceParams,
  type ExtractClaimsFromNewEvidenceResult,
  extractClaimsFromNewEvidence,
} from '../llm/functions/extractClaimsFromNewEvidence/index.js';
import {
  type TriageNewEvidenceParams,
  type TriageNewEvidenceResult,
  triageNewEvidence,
} from '../llm/functions/triageNewEvidence/index.js';
import { assert } from '../util/assert.js';
import { formatContentTextForIngest } from '../util/ingestContent/helpers/formatContentTextForIngest.js';
import type {
  RegressionAssertion,
  RegressionCase,
  RegressionOutcome,
} from './case.js';

const execFileAsync = promisify(execFile);

export const DEFAULT_REGRESSION_REPO_ROOT = resolve(
  import.meta.dirname,
  '../../../..',
);

export interface RegressionReplayDependencies {
  extractClaimsFromNewEvidence: (
    params: ExtractClaimsFromNewEvidenceParams,
  ) => Promise<ExtractClaimsFromNewEvidenceResult | null>;
  triageNewEvidence: (
    params: TriageNewEvidenceParams,
  ) => Promise<TriageNewEvidenceResult | null>;
}

export interface RegressionReplayOptions {
  dataDir?: string;
  dependencies?: Partial<RegressionReplayDependencies>;
  repoRoot?: string;
}

export interface RegressionReplayActual {
  claims: Claim[];
  impactEvents: ImpactEvent[];
  outcome: RegressionOutcome;
  triageResult: TriageNewEvidenceResult | null;
}

export interface RegressionReplayReport {
  actual: RegressionReplayActual;
  baseRevision: string;
  caseId: string;
  mismatches: string[];
  passed: boolean;
}

export interface MaterializedDataRoot {
  cleanup: () => Promise<void>;
  dataDir: string;
}

export async function replayRegressionCase(
  regressionCase: RegressionCase,
  options: RegressionReplayOptions = {},
): Promise<RegressionReplayReport> {
  let materialized: MaterializedDataRoot | undefined;

  try {
    materialized =
      options.dataDir == null
        ? await materializeDataAtRevision(
            regressionCase.source.baseRevision,
            options.repoRoot,
          )
        : undefined;
    const dataDir = options.dataDir ?? materialized?.dataDir;
    assert(dataDir != null, 'Expected replay data directory.');

    const actual = await executeSemanticReplay(regressionCase, dataDir, {
      extractClaimsFromNewEvidence,
      triageNewEvidence,
      ...options.dependencies,
    });
    const mismatches = evaluateRegressionResult(regressionCase, actual);

    return {
      actual,
      baseRevision: regressionCase.source.baseRevision,
      caseId: regressionCase.id,
      mismatches,
      passed: mismatches.length === 0,
    };
  } catch (error) {
    const actual: RegressionReplayActual = {
      claims: [],
      impactEvents: [],
      outcome: {
        kind: 'quarantine',
        reason: error instanceof Error ? error.message : String(error),
      },
      triageResult: null,
    };
    const mismatches = evaluateRegressionResult(regressionCase, actual);

    return {
      actual,
      baseRevision: regressionCase.source.baseRevision,
      caseId: regressionCase.id,
      mismatches,
      passed: mismatches.length === 0,
    };
  } finally {
    await materialized?.cleanup();
  }
}

export async function materializeDataAtRevision(
  revision: string,
  repoRoot = DEFAULT_REGRESSION_REPO_ROOT,
): Promise<MaterializedDataRoot> {
  const root = await mkdtemp(join(tmpdir(), 'mrtdown-regression-'));
  const archivePath = join(root, 'data.tar');

  try {
    await execFileAsync('git', [
      '-C',
      repoRoot,
      'archive',
      '--format=tar',
      `--output=${archivePath}`,
      revision,
      'data',
    ]);
    await execFileAsync('tar', ['-xf', archivePath, '-C', root]);
    await normalizeLegacyStationCodeDates(join(root, 'data'));
  } catch (error) {
    await rm(root, { force: true, recursive: true });
    throw error;
  }

  return {
    dataDir: join(root, 'data'),
    cleanup: async () => {
      await rm(root, { force: true, recursive: true });
    },
  };
}

export async function normalizeLegacyStationCodeDates(
  dataDir: string,
): Promise<void> {
  const stationDir = join(dataDir, 'station');

  for (const fileName of await readdir(stationDir)) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const filePath = join(stationDir, fileName);
    const station = JSON.parse(await readFile(filePath, 'utf8')) as {
      stationCodes?: Array<{
        endedAt?: unknown;
        startedAt?: unknown;
      }>;
    };
    let changed = false;

    for (const stationCode of station.stationCodes ?? []) {
      const startedAt = normalizeLegacyMidnightUtcDate(stationCode.startedAt);
      if (startedAt !== stationCode.startedAt) {
        stationCode.startedAt = startedAt;
        changed = true;
      }

      const endedAt = normalizeLegacyMidnightUtcDate(stationCode.endedAt);
      if (endedAt !== stationCode.endedAt) {
        stationCode.endedAt = endedAt;
        changed = true;
      }
    }

    if (changed) {
      await writeFile(filePath, `${JSON.stringify(station, null, 2)}\n`);
    }
  }
}

function normalizeLegacyMidnightUtcDate(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/.exec(value);
  return match?.[1] ?? value;
}

export function evaluateRegressionResult(
  regressionCase: RegressionCase,
  actual: RegressionReplayActual,
): string[] {
  const mismatches = compareOutcomes(regressionCase.expected.outcome, actual);

  for (const assertion of regressionCase.expected.assertions) {
    const candidates =
      assertion.kind === 'claim' ? actual.claims : actual.impactEvents;
    const matching = candidates.some((candidate) =>
      isPartialSemanticMatch(candidate, assertion.match),
    );

    if (assertion.presence === 'required' && !matching) {
      mismatches.push(formatAssertionMismatch('Missing', assertion));
    }
    if (assertion.presence === 'forbidden' && matching) {
      mismatches.push(formatAssertionMismatch('Found forbidden', assertion));
    }
  }

  return mismatches;
}

export function isPartialSemanticMatch(
  actual: unknown,
  expected: unknown,
): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }
    return expected.every((expectedItem) =>
      actual.some((actualItem) =>
        isPartialSemanticMatch(actualItem, expectedItem),
      ),
    );
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      return false;
    }
    return Object.entries(expected).every(([key, expectedValue]) =>
      isPartialSemanticMatch(actual[key], expectedValue),
    );
  }

  return Object.is(actual, expected);
}

async function executeSemanticReplay(
  regressionCase: RegressionCase,
  dataDir: string,
  dependencies: RegressionReplayDependencies,
): Promise<RegressionReplayActual> {
  const newEvidence = normalizedEvidenceForCase(regressionCase);
  const repo = new MRTDownRepository({ store: new FileStore(dataDir) });
  const triageResult = await dependencies.triageNewEvidence({
    newEvidence,
    repo,
  });

  if (triageResult == null) {
    return quarantined('Triage returned no result.');
  }
  if (triageResult.result.kind === 'irrelevant-content') {
    return {
      claims: [],
      impactEvents: [],
      outcome: { kind: 'ignore' },
      triageResult,
    };
  }

  const extractResult = await dependencies.extractClaimsFromNewEvidence({
    newEvidence,
    repo,
  });
  if (extractResult == null) {
    return quarantined('Claim extraction returned no result.', triageResult);
  }

  const { claims } = extractResult;
  if (triageResult.result.kind === 'part-of-new-issue' && claims.length === 0) {
    return {
      claims,
      impactEvents: [],
      outcome: { kind: 'ignore' },
      triageResult,
    };
  }

  const evidenceTs = DateTime.fromISO(newEvidence.ts, { setZone: true });
  assert(evidenceTs.isValid, `Invalid evidence timestamp: ${newEvidence.ts}`);
  const evidence: Evidence = {
    id: IdGenerator.evidenceId(evidenceTs),
    ts: evidenceTs.toISO({ includeOffset: true }),
    type: 'report.public',
    text: newEvidence.text,
    sourceUrl: regressionCase.source.url,
    render: null,
  };

  let issueBundle: IssueBundle;
  let outcome: RegressionOutcome;

  if (triageResult.result.kind === 'part-of-existing-issue') {
    const { issueId } = triageResult.result;
    const existing = repo.issues.get(issueId);
    if (existing == null) {
      return quarantined(
        `Triage selected missing issue ${issueId}.`,
        triageResult,
        claims,
      );
    }
    issueBundle = existing;
    outcome = { kind: 'update', issueId };
  } else {
    const issue: Issue = {
      id: '2000-01-01-regression-replay',
      type: triageResult.result.issueType,
      title: {
        'en-SG': 'Regression replay',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: { source: 'regression-replay' },
    };
    issueBundle = {
      issue,
      evidence: [],
      impactEvents: [],
      path: dataDir,
    };
    outcome = { kind: 'create', issueType: triageResult.result.issueType };
  }

  const { newImpactEvents } = computeImpactFromEvidenceClaims({
    issueBundle: {
      ...issueBundle,
      evidence: [...issueBundle.evidence, evidence],
    },
    evidenceId: evidence.id,
    evidenceTs: evidence.ts,
    claims,
  });

  return {
    claims,
    impactEvents: newImpactEvents,
    outcome,
    triageResult,
  };
}

function normalizedEvidenceForCase(regressionCase: RegressionCase): {
  ts: string;
  text: string;
} {
  if (regressionCase.input.kind === 'model-evidence') {
    return regressionCase.input.evidence;
  }

  const createdAt = DateTime.fromISO(regressionCase.input.content.createdAt)
    .setZone('Asia/Singapore')
    .toISO();
  assert(createdAt != null, 'Expected valid createdAt');
  const normalizedContent = {
    ...regressionCase.input.content,
    createdAt,
  };

  return {
    ts: createdAt,
    text: formatContentTextForIngest(normalizedContent),
  };
}

function compareOutcomes(
  expected: RegressionOutcome,
  actual: RegressionReplayActual,
): string[] {
  if (expected.kind !== actual.outcome.kind) {
    return [
      `Expected outcome ${expected.kind}, received ${actual.outcome.kind}.`,
    ];
  }

  switch (expected.kind) {
    case 'create':
      return actual.outcome.kind === 'create' &&
        expected.issueType === actual.outcome.issueType
        ? []
        : [
            `Expected create issue type ${expected.issueType}, received ${
              actual.outcome.kind === 'create'
                ? actual.outcome.issueType
                : actual.outcome.kind
            }.`,
          ];
    case 'update':
      return actual.outcome.kind === 'update' &&
        expected.issueId === actual.outcome.issueId
        ? []
        : [
            `Expected update issue ${expected.issueId}, received ${
              actual.outcome.kind === 'update'
                ? actual.outcome.issueId
                : actual.outcome.kind
            }.`,
          ];
    case 'quarantine':
      return actual.outcome.kind === 'quarantine' &&
        expected.reason === actual.outcome.reason
        ? []
        : ['Quarantine reason did not match the expected reason.'];
    case 'ignore':
      return [];
  }
}

function formatAssertionMismatch(
  prefix: string,
  assertion: RegressionAssertion,
): string {
  return `${prefix} ${assertion.kind} matching ${JSON.stringify(assertion.match)}.`;
}

function quarantined(
  reason: string,
  triageResult: TriageNewEvidenceResult | null = null,
  claims: Claim[] = [],
): RegressionReplayActual {
  return {
    claims,
    impactEvents: [],
    outcome: { kind: 'quarantine', reason },
    triageResult,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
