/**
 * Re-extracts LLM claims for evidence items that produced period violations
 * (endAt <= startAt, recurring zero duration, open-ended future startAt),
 * then replays the affected issues with the corrected claims.
 *
 * Use this after fixing the extraction prompt to verify the fix is effective.
 *
 * Phase 1 – Scan all issues for period violations in impact.ndjson and collect
 *            the (issueId, evidenceId) pairs that need re-extraction.
 *
 * Phase 2 – For each affected issue, call extractClaimsFromNewEvidence for the
 *            problematic evidence items, then replay the full issue using the
 *            fresh LLM claims for those items and reconstructed claims for the
 *            rest.
 */

import 'dotenv/config';
import { join, resolve } from 'node:path';
import type {
  Claim,
  ClaimTimeHints,
  ImpactEvent,
  IssueBundle,
  Period,
} from '@mrtdown/core';
import {
  FileStore,
  FileWriteStore,
  MRTDownRepository,
} from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import { computeImpactFromEvidenceClaims } from '../helpers/computeImpactFromEvidenceClaims.js';
import { deriveCurrentState, type IssueBundleState } from '../helpers/deriveCurrentState.js';
import { keyForAffectedEntity } from '../helpers/keyForAffectedEntity.js';
import { reconstructClaimsFromImpactEvents } from '../helpers/reconstructClaimsFromImpactEvents.js';
import { extractClaimsFromNewEvidence } from '../llm/functions/extractClaimsFromNewEvidence/index.js';
import {
  collectReExtractTargets,
  parseReExtractArgs,
} from './reExtractAndReplayTargets.js';

/**
 * Adapts the timeHints in a fresh LLM claim to match the current rolling state.
 *
 * The LLM produces claims without knowledge of the current state, so it
 * always uses `fixed` for "disruption is happening". We must convert:
 *  - fixed(endAt=null) + existing open period  → start-only (preserve anchor)
 *  - fixed(endAt!=null) + existing open period → end-only   (preserve anchor)
 *  - fixed + no open period                    → keep as fixed
 *  - recurring / start-only / end-only         → unchanged
 */
function adaptClaimsToState(
  claims: Claim[],
  currentState: IssueBundleState,
): Claim[] {
  return claims.map((claim) => {
    const { timeHints } = claim;
    if (timeHints == null || timeHints.kind !== 'fixed') return claim;

    const entityKey = keyForAffectedEntity(claim.entity);
    const currentPeriods: Period[] =
      claim.entity.type === 'service'
        ? (currentState.services[entityKey]?.periods ?? [])
        : (currentState.facilities[entityKey]?.periods ?? []);

    const openPeriod = currentPeriods.find(
      (p): p is Period & { kind: 'fixed'; endAt: null } =>
        p.kind === 'fixed' && p.endAt == null,
    );

    if (!openPeriod) return claim; // no existing open period — keep fixed

    let adapted: ClaimTimeHints;
    if (timeHints.endAt == null) {
      adapted = { kind: 'start-only', startAt: timeHints.startAt };
    } else {
      adapted = { kind: 'end-only', endAt: timeHints.endAt };
    }
    return { ...claim, timeHints: adapted };
  });
}

const DATA_DIR = resolve(import.meta.dirname, '../../../../data');

const store = new FileStore(DATA_DIR);
const writeStore = new FileWriteStore(DATA_DIR);
const repo = new MRTDownRepository({ store });
const args = parseReExtractArgs(process.argv.slice(2));
const reExtractTargets = collectReExtractTargets(repo, args);

const totalEvidenceItems = [...reExtractTargets.values()].reduce(
  (sum, s) => sum + s.size,
  0,
);
console.log(
  `Found ${reExtractTargets.size} issues for mode "${args.mode}" (${totalEvidenceItems} evidence items to re-extract).\n`,
);

if (reExtractTargets.size === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

if (args.dryRun) {
  for (const [issueId, evidenceIds] of reExtractTargets) {
    console.log(`${issueId}: ${[...evidenceIds].join(', ')}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Phase 2: Re-extract claims and replay each affected issue
// ---------------------------------------------------------------------------

let totalBefore = 0;
let totalAfter = 0;
let extractErrors = 0;

for (const [issueId, evidenceIds] of reExtractTargets) {
  const bundle = repo.issues.get(issueId);
  if (!bundle) continue;

  const { issue, evidence, impactEvents } = bundle;

  // Build evidenceId → original ImpactEvent[] map (reconstruction fallback)
  const impactByEvidenceId = new Map<string, ImpactEvent[]>();
  for (const ev of impactEvents) {
    const evidenceId = (ev as { basis?: { evidenceId?: string } }).basis
      ?.evidenceId;
    if (!evidenceId) continue;
    const list = impactByEvidenceId.get(evidenceId) ?? [];
    list.push(ev);
    impactByEvidenceId.set(evidenceId, list);
  }

  // Re-extract claims for each problematic evidence item
  const freshClaims = new Map<string, Claim[]>(); // evidenceId → Claim[]

  for (const ev of evidence) {
    if (!evidenceIds.has(ev.id)) continue;

    console.log(`  [${issueId}] re-extracting ${ev.id}`);
    console.log(`    ts: ${ev.ts}`);
    console.log(`    text: ${ev.text.slice(0, 100)}`);

    try {
      const { claims } = await extractClaimsFromNewEvidence({
        newEvidence: { ts: ev.ts, text: ev.text },
        repo,
      });
      freshClaims.set(ev.id, claims);
      console.log(`    → ${claims.length} claim(s)\n`);
    } catch (err) {
      console.error(`    ✗ Error:`, err);
      extractErrors++;
    }
  }

  // Replay the full issue in chronological order
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
    rollingBundle.evidence = [...rollingBundle.evidence, ev];

    // Derive current state before this evidence (needed for both paths)
    const currentState = deriveCurrentState({
      ...rollingBundle,
      evidence: rollingBundle.evidence.slice(0, -1),
    });

    let claims: Claim[];

    if (freshClaims.has(ev.id)) {
      // Use the newly extracted (corrected) claims, but adapt their time hints
      // to the current state — the LLM doesn't know about existing open periods.
      const raw = freshClaims.get(ev.id) ?? [];
      claims = adaptClaimsToState(raw, currentState);
    } else {
      // Fall back to reconstruction from original impact events
      const originalEvents = impactByEvidenceId.get(ev.id) ?? [];
      if (originalEvents.length === 0) continue;

      claims = reconstructClaimsFromImpactEvents(originalEvents, currentState);
    }

    if (claims.length === 0) continue;

    const { newImpactEvents: evImpacts } = computeImpactFromEvidenceClaims({
      issueBundle: rollingBundle,
      evidenceId: ev.id,
      evidenceTs: ev.ts,
      claims,
    });

    newImpactEvents.push(...evImpacts);
    rollingBundle.impactEvents = [...rollingBundle.impactEvents, ...evImpacts];
  }

  // Write updated impact.ndjson
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
  console.log(
    `${issueId}: ${before} → ${after} events (${diff >= 0 ? '+' : ''}${diff})`,
  );

  totalBefore += before;
  totalAfter += after;
}

console.log(`\nDone.`);
if (extractErrors > 0) {
  console.warn(`  ${extractErrors} extraction error(s) — those evidence items kept their original claims.`);
}
console.log(
  `Total impact events: ${totalBefore} → ${totalAfter} (${totalAfter - totalBefore >= 0 ? '+' : ''}${totalAfter - totalBefore})`,
);
