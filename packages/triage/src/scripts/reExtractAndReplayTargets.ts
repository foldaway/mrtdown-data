import type { ImpactEvent, IssueBundle } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import {
  evidenceMatchesDegradedFutureSuspensionPattern,
  impactEventsMatchFutureNoServiceMisclassification,
} from '../llm/functions/extractClaimsFromNewEvidence/degradedServiceHeuristics.js';

export type ReExtractMode =
  | 'period-violations'
  | 'degraded-future-no-service'
  | 'empty-impact';

export interface ReExtractTargetOptions {
  mode: ReExtractMode;
  issueIds?: Set<string>;
  evidenceIds?: Set<string>;
}

export interface ParsedReExtractArgs extends ReExtractTargetOptions {
  dryRun: boolean;
}

export function parseReExtractArgs(argv: string[]): ParsedReExtractArgs {
  const issueIds = new Set<string>();
  const evidenceIds = new Set<string>();
  let mode: ReExtractMode = 'period-violations';
  let dryRun = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--mode') {
      const value = argv[index + 1];
      if (
        value !== 'period-violations' &&
        value !== 'degraded-future-no-service' &&
        value !== 'empty-impact'
      ) {
        throw new Error(`Unsupported --mode value: ${value ?? '(missing)'}`);
      }
      mode = value;
      index++;
      continue;
    }

    if (arg === '--issue') {
      const value = argv[index + 1];
      if (value == null) {
        throw new Error('Missing value for --issue');
      }
      issueIds.add(value);
      index++;
      continue;
    }

    if (arg === '--evidence') {
      const value = argv[index + 1];
      if (value == null) {
        throw new Error('Missing value for --evidence');
      }
      evidenceIds.add(value);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    mode,
    dryRun,
    issueIds: issueIds.size > 0 ? issueIds : undefined,
    evidenceIds: evidenceIds.size > 0 ? evidenceIds : undefined,
  };
}

export function hasPeriodViolation(event: ImpactEvent): boolean {
  if (event.type !== 'periods.set') return false;
  const tsMs = Date.parse(event.ts);
  for (const period of event.periods) {
    if (period.kind === 'fixed') {
      const startMs = Date.parse(period.startAt);
      if (period.endAt != null) {
        const endMs = Date.parse(period.endAt);
        if (endMs <= startMs) return true;
      } else if (startMs > tsMs) {
        return true;
      }
    } else if (period.kind === 'recurring') {
      const startMs = Date.parse(period.startAt);
      const endMs = Date.parse(period.endAt);
      if (endMs <= startMs) return true;
    }
  }
  return false;
}

function collectViolationEvidenceIds(bundle: IssueBundle): Set<string> {
  const evidenceIds = new Set<string>();

  for (const event of bundle.impactEvents) {
    if (!hasPeriodViolation(event)) continue;
    const evidenceId = (event as { basis?: { evidenceId?: string } }).basis
      ?.evidenceId;
    if (evidenceId != null) {
      evidenceIds.add(evidenceId);
    }
  }

  return evidenceIds;
}

function collectDegradedFutureNoServiceEvidenceIds(
  bundle: IssueBundle,
): Set<string> {
  const impactByEvidenceId = new Map<string, ImpactEvent[]>();

  for (const event of bundle.impactEvents) {
    const evidenceId = (event as { basis?: { evidenceId?: string } }).basis
      ?.evidenceId;
    if (evidenceId == null) continue;

    const current = impactByEvidenceId.get(evidenceId) ?? [];
    current.push(event);
    impactByEvidenceId.set(evidenceId, current);
  }

  const evidenceIds = new Set<string>();

  for (const evidence of bundle.evidence) {
    const impactEvents = impactByEvidenceId.get(evidence.id) ?? [];
    if (impactEvents.length === 0) continue;
    if (
      !evidenceMatchesDegradedFutureSuspensionPattern(evidence.text) ||
      !impactEventsMatchFutureNoServiceMisclassification({
        impactEvents,
        evidenceTs: evidence.ts,
      })
    ) {
      continue;
    }

    evidenceIds.add(evidence.id);
  }

  return evidenceIds;
}

function collectEmptyImpactEvidenceIds(bundle: IssueBundle): Set<string> {
  if (bundle.evidence.length === 0 || bundle.impactEvents.length > 0) {
    return new Set();
  }

  return new Set(bundle.evidence.map((evidence) => evidence.id));
}

export function collectReExtractTargets(
  repo: MRTDownRepository,
  options: ReExtractTargetOptions,
): Map<string, Set<string>> {
  const issueIds = options.issueIds
    ? [...options.issueIds]
    : repo.issues.listIds();
  const targets = new Map<string, Set<string>>();

  for (const issueId of issueIds) {
    const bundle = repo.issues.get(issueId);
    if (!bundle) continue;

    const evidenceIds =
      options.mode === 'degraded-future-no-service'
        ? collectDegradedFutureNoServiceEvidenceIds(bundle)
        : options.mode === 'empty-impact'
          ? collectEmptyImpactEvidenceIds(bundle)
          : collectViolationEvidenceIds(bundle);

    if (options.evidenceIds != null) {
      for (const evidenceId of [...evidenceIds]) {
        if (!options.evidenceIds.has(evidenceId)) {
          evidenceIds.delete(evidenceId);
        }
      }
    }

    if (evidenceIds.size > 0) {
      targets.set(issueId, evidenceIds);
    }
  }

  return targets;
}
