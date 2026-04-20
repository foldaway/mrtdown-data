import { resolve } from 'node:path';
import { replayImpactEvents } from '../maintenance/replayImpactEvents.js';

const DATA_DIR = resolve(import.meta.dirname, '../../../../data');

const summary = replayImpactEvents({ dataDir: DATA_DIR });

console.log(`Replayed impact events for ${summary.issuesProcessed} issues.`);
for (const result of summary.results) {
  if (result.diff !== 0) {
    console.log(
      `${result.issueId}: ${result.before} → ${result.after} events (${result.diff >= 0 ? '+' : ''}${result.diff})`,
    );
  }
}
console.log(
  `Total impact events: ${summary.totalBefore} → ${summary.totalAfter} (${summary.totalAfter - summary.totalBefore >= 0 ? '+' : ''}${summary.totalAfter - summary.totalBefore})`,
);
