import { join, resolve } from 'node:path';
import type { Claim, ImpactEvent, IssueBundle } from '@mrtdown/core';
import { FileStore, FileWriteStore, MRTDownRepository } from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import { deriveCurrentState } from '../helpers/deriveCurrentState.js';
import { reconstructClaimsFromImpactEvents } from '../helpers/reconstructClaimsFromImpactEvents.js';
import { normalizeClaimsForEvidence } from '../llm/functions/extractClaimsFromNewEvidence/normalizeClaimsForEvidence.js';

export interface ReplayImpactEventsOptions {
  dataDir: string;
  issueIds?: Iterable<string>;
  dryRun?: boolean;
}

export interface ReplayImpactEventsIssueResult {
  issueId: string;
  before: number;
  after: number;
  diff: number;
}

export interface ReplayImpactEventsSummary {
  dryRun: boolean;
  issuesProcessed: number;
  totalBefore: number;
  totalAfter: number;
  results: ReplayImpactEventsIssueResult[];
}

export function replayImpactEvents(
  options: ReplayImpactEventsOptions,
): ReplayImpactEventsSummary {
  const dataDir = resolve(options.dataDir);
  const store = new FileStore(dataDir);
  const writeStore = new FileWriteStore(dataDir);
  const repo = new MRTDownRepository({ store });
  const selectedIssueIds = options.issueIds
    ? new Set(options.issueIds)
    : undefined;

  const issueIds = repo
    .issues
    .listIds()
    .filter((issueId) => selectedIssueIds?.has(issueId) ?? true);

  let issuesProcessed = 0;
  let totalBefore = 0;
  let totalAfter = 0;
  const results: ReplayImpactEventsIssueResult[] = [];

  for (const issueId of issueIds) {
    const bundle = repo.issues.get(issueId);
    if (bundle == null || bundle.evidence.length === 0) {
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
      const originalEvents = impactByEvidenceId.get(item.id) ?? [];
      rollingBundle.evidence = [...rollingBundle.evidence, item];

      if (originalEvents.length === 0) {
        continue;
      }

      const currentState = deriveCurrentState({
        ...rollingBundle,
        evidence: rollingBundle.evidence.slice(0, -1),
      });

      const reconstructed = reconstructClaimsFromImpactEvents(
        originalEvents,
        currentState,
      );
      const claims: Claim[] = normalizeClaimsForEvidence({
        claims: reconstructed,
        evidenceText: item.text,
        evidenceTs: item.ts,
        repo,
      });

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

    if (!options.dryRun) {
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
    }

    const before = impactEvents.length;
    const after = newImpactEvents.length;
    results.push({
      issueId,
      before,
      after,
      diff: after - before,
    });
    issuesProcessed++;
    totalBefore += before;
    totalAfter += after;
  }

  return {
    dryRun: options.dryRun ?? false,
    issuesProcessed,
    totalBefore,
    totalAfter,
    results,
  };
}
