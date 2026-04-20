import { join, resolve } from 'node:path';
import type {
  Claim,
  ClaimTimeHints,
  ImpactEvent,
  IssueBundle,
  Period,
} from '@mrtdown/core';
import { FileStore, FileWriteStore, MRTDownRepository } from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import { deriveCurrentState, type IssueBundleState } from '../helpers/deriveCurrentState.js';
import { keyForAffectedEntity } from '../helpers/keyForAffectedEntity.js';
import { reconstructClaimsFromImpactEvents } from '../helpers/reconstructClaimsFromImpactEvents.js';
import { extractClaimsFromNewEvidence } from '../llm/functions/extractClaimsFromNewEvidence/index.js';
import { normalizeClaimsForEvidence } from '../llm/functions/extractClaimsFromNewEvidence/normalizeClaimsForEvidence.js';
import {
  collectReExtractTargets,
  type ReExtractMode,
} from '../scripts/reExtractAndReplayTargets.js';

export interface ReExtractAndReplayOptions {
  dataDir: string;
  mode: ReExtractMode;
  issueIds?: Iterable<string>;
  evidenceIds?: Iterable<string>;
  dryRun?: boolean;
}

export interface ReExtractAndReplayIssueResult {
  issueId: string;
  targetedEvidenceIds: string[];
  before?: number;
  after?: number;
  diff?: number;
}

export interface ReExtractAndReplaySummary {
  dryRun: boolean;
  mode: ReExtractMode;
  totalTargetIssues: number;
  totalTargetEvidenceItems: number;
  totalBefore: number;
  totalAfter: number;
  extractErrors: number;
  results: ReExtractAndReplayIssueResult[];
}

/**
 * The LLM extracts claims without the rolling issue state, so convert fixed
 * open/update periods to start-only / end-only when there is already an open
 * period for the same entity.
 */
function adaptClaimsToState(
  claims: Claim[],
  currentState: IssueBundleState,
): Claim[] {
  return claims.map((claim) => {
    const { timeHints } = claim;
    if (timeHints == null || timeHints.kind !== 'fixed') {
      return claim;
    }

    const entityKey = keyForAffectedEntity(claim.entity);
    const currentPeriods: Period[] =
      claim.entity.type === 'service'
        ? (currentState.services[entityKey]?.periods ?? [])
        : (currentState.facilities[entityKey]?.periods ?? []);

    const openPeriod = currentPeriods.find(
      (period): period is Period & { kind: 'fixed'; endAt: null } =>
        period.kind === 'fixed' && period.endAt == null,
    );
    if (!openPeriod) {
      return claim;
    }

    const adapted: ClaimTimeHints =
      timeHints.endAt == null
        ? {
            kind: 'start-only',
            startAt: timeHints.startAt,
          }
        : {
            kind: 'end-only',
            endAt: timeHints.endAt,
          };

    return {
      ...claim,
      timeHints: adapted,
    };
  });
}

export async function reExtractAndReplay(
  options: ReExtractAndReplayOptions,
): Promise<ReExtractAndReplaySummary> {
  const dataDir = resolve(options.dataDir);
  const store = new FileStore(dataDir);
  const writeStore = new FileWriteStore(dataDir);
  const repo = new MRTDownRepository({ store });
  const issueIds = options.issueIds ? new Set(options.issueIds) : undefined;
  const evidenceIds = options.evidenceIds
    ? new Set(options.evidenceIds)
    : undefined;

  const reExtractTargets = collectReExtractTargets(repo, {
    mode: options.mode,
    issueIds,
    evidenceIds,
  });
  const totalTargetEvidenceItems = [...reExtractTargets.values()].reduce(
    (sum, set) => sum + set.size,
    0,
  );

  if (options.dryRun) {
    return {
      dryRun: true,
      mode: options.mode,
      totalTargetIssues: reExtractTargets.size,
      totalTargetEvidenceItems,
      totalBefore: 0,
      totalAfter: 0,
      extractErrors: 0,
      results: [...reExtractTargets.entries()].map(
        ([issueId, targetEvidenceIds]) => ({
          issueId,
          targetedEvidenceIds: [...targetEvidenceIds],
        }),
      ),
    };
  }

  let totalBefore = 0;
  let totalAfter = 0;
  let extractErrors = 0;
  const results: ReExtractAndReplayIssueResult[] = [];

  for (const [issueId, targetEvidenceIds] of reExtractTargets) {
    const bundle = repo.issues.get(issueId);
    if (bundle == null) {
      continue;
    }

    const { issue, evidence, impactEvents } = bundle;
    const impactByEvidenceId = new Map<string, ImpactEvent[]>();

    for (const event of impactEvents) {
      const evidenceId = (event as { basis?: { evidenceId?: string } }).basis
        ?.evidenceId;
      if (evidenceId == null) continue;

      const current = impactByEvidenceId.get(evidenceId) ?? [];
      current.push(event);
      impactByEvidenceId.set(evidenceId, current);
    }

    const freshClaims = new Map<string, Claim[]>();

    for (const item of evidence) {
      if (!targetEvidenceIds.has(item.id)) {
        continue;
      }

      try {
        const { claims } = await extractClaimsFromNewEvidence({
          newEvidence: {
            ts: item.ts,
            text: item.text,
          },
          repo,
        });
        freshClaims.set(item.id, claims);
      } catch {
        extractErrors++;
      }
    }

    const sortedEvidence = [...evidence].sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0,
    );

    const rollingBundle: IssueBundle = {
      issue,
      evidence: [],
      impactEvents: [],
      path: bundle.path,
    };
    const newImpactEvents: ImpactEvent[] = [];

    for (const item of sortedEvidence) {
      rollingBundle.evidence = [...rollingBundle.evidence, item];
      const currentState = deriveCurrentState({
        ...rollingBundle,
        evidence: rollingBundle.evidence.slice(0, -1),
      });

      let claims: Claim[];
      if (freshClaims.has(item.id)) {
        claims = adaptClaimsToState(freshClaims.get(item.id) ?? [], currentState);
      } else {
        const originalEvents = impactByEvidenceId.get(item.id) ?? [];
        if (originalEvents.length === 0) {
          continue;
        }

        const reconstructed = reconstructClaimsFromImpactEvents(
          originalEvents,
          currentState,
        );
        claims = normalizeClaimsForEvidence({
          claims: reconstructed,
          evidenceText: item.text,
          evidenceTs: item.ts,
          repo,
        });
      }

      if (claims.length === 0) {
        continue;
      }

      const { newImpactEvents: replayedEvents } = computeImpactFromEvidenceClaims(
        {
          issueBundle: rollingBundle,
          evidenceId: item.id,
          evidenceTs: item.ts,
          claims,
        },
      );

      newImpactEvents.push(...replayedEvents);
      rollingBundle.impactEvents = [
        ...rollingBundle.impactEvents,
        ...replayedEvents,
      ];
    }

    const issuePath = repo.issues.getPath(issueId);
    if (issuePath == null) {
      continue;
    }

    const impactRelPath = join(issuePath, 'impact.ndjson');
    const content =
      newImpactEvents.length > 0
        ? `${newImpactEvents.map((event) => NdJson.stringify([event])).join('\n')}\n`
        : '';
    writeStore.writeText(impactRelPath, content);

    const before = impactEvents.length;
    const after = newImpactEvents.length;
    totalBefore += before;
    totalAfter += after;
    results.push({
      issueId,
      targetedEvidenceIds: [...targetEvidenceIds],
      before,
      after,
      diff: after - before,
    });
  }

  return {
    dryRun: false,
    mode: options.mode,
    totalTargetIssues: reExtractTargets.size,
    totalTargetEvidenceItems,
    totalBefore,
    totalAfter,
    extractErrors,
    results,
  };
}
