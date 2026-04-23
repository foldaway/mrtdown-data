import 'dotenv/config';
import { resolve } from 'node:path';
import { reExtractAndReplay } from '../maintenance/reExtractAndReplay.js';
import { parseReExtractArgs } from './reExtractAndReplayTargets.js';

const DATA_DIR = resolve(import.meta.dirname, '../../../../data');
const args = parseReExtractArgs(process.argv.slice(2));

const summary = await reExtractAndReplay({
  dataDir: DATA_DIR,
  mode: args.mode,
  issueIds: args.issueIds,
  evidenceIds: args.evidenceIds,
  dryRun: args.dryRun,
});

console.log(
  `Found ${summary.totalTargetIssues} issues for mode "${summary.mode}" (${summary.totalTargetEvidenceItems} evidence items).`,
);

if (summary.dryRun) {
  for (const result of summary.results) {
    console.log(`${result.issueId}: ${result.targetedEvidenceIds.join(', ')}`);
  }
  process.exit(0);
}

for (const result of summary.results) {
  console.log(
    `${result.issueId}: ${result.before} → ${result.after} events (${(result.diff ?? 0) >= 0 ? '+' : ''}${result.diff})`,
  );
}

if (summary.extractErrors > 0) {
  console.warn(
    `${summary.extractErrors} extraction error(s) — those evidence items kept their original claims.`,
  );
}

console.log(
  `Total impact events: ${summary.totalBefore} → ${summary.totalAfter} (${summary.totalAfter - summary.totalBefore >= 0 ? '+' : ''}${summary.totalAfter - summary.totalBefore})`,
);
