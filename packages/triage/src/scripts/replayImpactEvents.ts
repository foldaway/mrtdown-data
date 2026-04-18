/**
 * Replays all impact events for every issue from the existing evidence and
 * impact data, without calling any LLM.
 *
 * Claims are reconstructed from the existing impact events (grouped by
 * basis.evidenceId). Time hints are derived by comparing the original
 * periods.set payload against the rolling canonical state:
 *
 *   - Updating an open-ended fixed period → start-only (preserves anchor startAt)
 *   - Closing an open-ended fixed period  → end-only   (preserves anchor startAt)
 *   - Opening a fresh / re-opening a closed period → fixed (explicit bounds)
 *   - Recurring period                    → recurring  (used as-is)
 *
 * The fix to reconcilePeriodsWithTimeHints (start-only never advances startAt)
 * means subsequent routine updates that provide a later startAt are no-ops,
 * collapsing the "rolling startAt" anti-pattern into a single stable anchor.
 */

import { join, resolve } from 'node:path';
import type {
  Claim,
  ImpactEvent,
  IssueBundle,
} from '@mrtdown/core';
import {
  FileStore,
  FileWriteStore,
  MRTDownRepository,
} from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import { deriveCurrentState } from '../helpers/deriveCurrentState.js';
import { reconstructClaimsFromImpactEvents } from '../helpers/reconstructClaimsFromImpactEvents.js';
import { normalizeClaimsForEvidence } from '../llm/functions/extractClaimsFromNewEvidence/normalizeClaimsForEvidence.js';

const DATA_DIR = resolve(import.meta.dirname, '../../../../data');

const store = new FileStore(DATA_DIR);
const writeStore = new FileWriteStore(DATA_DIR);
const repo = new MRTDownRepository({ store });

const issueIds = repo.issues.listIds();
console.log(`Replaying impact events for ${issueIds.length} issues…\n`);

let totalIssues = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const issueId of issueIds) {
  const bundle = repo.issues.get(issueId);
  if (!bundle) continue;

  const { issue, evidence, impactEvents } = bundle;

  if (evidence.length === 0) {
    continue;
  }

  // ------------------------------------------------------------------
  // Build evidenceId → original ImpactEvent[] mapping
  // ------------------------------------------------------------------
  const impactByEvidenceId = new Map<string, ImpactEvent[]>();
  for (const ev of impactEvents) {
    const evidenceId = (ev as { basis?: { evidenceId?: string } }).basis
      ?.evidenceId;
    if (!evidenceId) continue;
    const list = impactByEvidenceId.get(evidenceId) ?? [];
    list.push(ev);
    impactByEvidenceId.set(evidenceId, list);
  }

  // ------------------------------------------------------------------
  // Replay evidence in chronological order (evidence.ndjson may be
  // appended out of order when ingestion happens out of sequence)
  // ------------------------------------------------------------------
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

  for (const ev of sortedEvidence) {
    const originalEvents = impactByEvidenceId.get(ev.id) ?? [];

    // Add this evidence to the rolling bundle before deriving state so that
    // computeImpactFromEvidenceClaims sees it as the current evidence.
    rollingBundle.evidence = [...rollingBundle.evidence, ev];

    if (originalEvents.length === 0) {
      continue;
    }

    // Derive the current (pre-this-evidence) state to inform time-hint choice.
    const currentState = deriveCurrentState({
      ...rollingBundle,
      // Exclude the evidence we just added — we only want the state from
      // impact events already appended.
      evidence: rollingBundle.evidence.slice(0, -1),
    });

    // ------------------------------------------------------------------
    // Reconstruct claims from original events, then apply the same
    // post-extraction normalization used during live ingestion so that
    // fixes (e.g. station-mention filtering) apply to historical data.
    // ------------------------------------------------------------------
    const reconstructed = reconstructClaimsFromImpactEvents(
      originalEvents,
      currentState,
    );
    const claims: Claim[] = normalizeClaimsForEvidence({
      claims: reconstructed,
      evidenceText: ev.text,
      evidenceTs: ev.ts,
      repo,
    });

    // ------------------------------------------------------------------
    // Run computeImpactFromEvidenceClaims against the rolling bundle
    // ------------------------------------------------------------------
    if (claims.length > 0) {
      const { newImpactEvents: evImpacts } = computeImpactFromEvidenceClaims({
        issueBundle: rollingBundle,
        evidenceId: ev.id,
        evidenceTs: ev.ts,
        claims,
      });

      newImpactEvents.push(...evImpacts);
      rollingBundle.impactEvents = [
        ...rollingBundle.impactEvents,
        ...evImpacts,
      ];
    }
  }

  // ------------------------------------------------------------------
  // Write new impact.ndjson (replace entirely)
  // ------------------------------------------------------------------
  const issuePath = repo.issues.getPath(issueId);
  if (!issuePath) continue;

  const impactRelPath = join(issuePath, 'impact.ndjson');
  const content =
    newImpactEvents.length > 0
      ? `${newImpactEvents.map((e) => NdJson.stringify([e])).join('\n')}\n`
      : '';
  writeStore.writeText(impactRelPath, content);

  const before = impactEvents.length;
  const after = newImpactEvents.length;
  const diff = after - before;
  if (diff !== 0) {
    console.log(
      `${issueId}: ${before} → ${after} events (${diff >= 0 ? '+' : ''}${diff})`,
    );
  }

  totalIssues++;
  totalBefore += before;
  totalAfter += after;
}

console.log(`\nDone. ${totalIssues} issues processed.`);
console.log(`Total impact events: ${totalBefore} → ${totalAfter} (${totalAfter - totalBefore >= 0 ? '+' : ''}${totalAfter - totalBefore})`);
