import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { reconcileGtfsCapture } from '../packages/fs/dist/index.js';

const [file, capture, output, ...extra] = process.argv.slice(2);
if (!file || !capture || !output || extra.length)
  throw new Error(
    'Usage: node scripts/reconcile-gtfs-schedule.mjs <schedule.zip> <capture.json> <new-report.json>',
  );
// Bind provenance to the committed canonical tree, including untracked records.
const cwd = resolve(import.meta.dirname, '..');
const dirty = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', 'data'],
  { cwd, encoding: 'utf8' },
);
if (dirty.trim())
  throw new Error(
    'Canonical data tree has uncommitted changes; commit it before reconciliation',
  );
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd,
  encoding: 'utf8',
}).trim();
const report = await reconcileGtfsCapture(
  resolve(file),
  resolve(capture),
  resolve(cwd, 'data'),
  commit,
);
await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    output: resolve(output),
    entries: report.entries.length,
    generationEligible: report.generationEligible,
  }),
);
