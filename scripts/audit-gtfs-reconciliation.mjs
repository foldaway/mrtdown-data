import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  readSchedule,
  readScheduleFiles,
} from '../packages/fs/dist/gtfs/schedule.js';
import {
  buildReconciliationEvidence,
  compareScheduleSnapshots,
  hashBytes,
  inspectGtfsDirectory,
  listEntities,
  proposeScheduleReconciliation,
  readVerifiedCapture,
  scheduleTopologyProjection,
} from '../packages/fs/dist/index.js';

const [file, captureFile, historicalDirectory, output, ...extra] =
  process.argv.slice(2);
if (
  !file ||
  !captureFile ||
  !historicalDirectory ||
  !output ||
  (extra.length &&
    (extra.length !== 2 ||
      extra[0] !== '--canonical-commit' ||
      !/^[a-f0-9]{40}$/.test(extra[1] ?? '')))
)
  throw new Error(
    'Usage: node scripts/audit-gtfs-reconciliation.mjs <schedule.zip> <capture.json> <historical-directory> <new-output-directory> [--canonical-commit <full-sha>]',
  );
const cwd = resolve(import.meta.dirname, '..');
const dirty = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', 'data'],
  { cwd, encoding: 'utf8' },
);
if (dirty.trim()) throw new Error('Canonical data must match committed HEAD');
const canonicalCommit = execFileSync(
  'git',
  ['rev-parse', '--verify', extra[1] ? `${extra[1]}^{commit}` : 'HEAD'],
  {
    cwd,
    encoding: 'utf8',
  },
).trim();
// An older exact commit is reproducible only if this checkout has the same data.
execFileSync('git', ['diff', '--quiet', canonicalCommit, '--', 'data'], {
  cwd,
});
const { capture, bytes } = await readVerifiedCapture(
  resolve(file),
  resolve(captureFile),
);
if (capture.feed_kind !== 'schedule')
  throw new Error('Requires schedule capture');
const current = readSchedule(bytes);
const historical = await inspectGtfsDirectory(
  resolve(historicalDirectory),
  join(cwd, 'docs/gtfs-historical-schedule-manifest.json'),
);
const files = {};
for (const [name, digest] of Object.entries(historical.manifest)) {
  const bytes = await readFile(join(historicalDirectory, name));
  if (hashBytes(bytes) !== digest)
    throw new Error(`Historical table changed after verification: ${name}`);
  files[name] = bytes;
}
const previous = readScheduleFiles(files);
const [operators, lines, stations, services] = await Promise.all(
  ['operator', 'line', 'station', 'service'].map((kind) =>
    listEntities(join(cwd, 'data'), kind),
  ),
);
if ([operators, lines, stations, services].some((records) => !records.length))
  throw new Error('Missing canonical topology');
const topology = scheduleTopologyProjection({
  operators: operators.map((record) => record.value),
  lines: lines.map((record) => record.value),
  stations: stations.map((record) => record.value),
  services: services.map((record) => record.value),
});
const identity = {
  sourceManifest: current.manifest,
  canonicalCommit,
  topology: {
    projectionVersion: 1,
    sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
  },
};
const report = proposeScheduleReconciliation(
  current.tables,
  identity,
  topology,
);
const evidence = buildReconciliationEvidence(
  current.tables,
  identity,
  topology,
);
const drift = compareScheduleSnapshots(previous, current);
await mkdir(resolve(output));
const digests = {};
for (const [name, content] of Object.entries({
  'proposals.json': report,
  'evidence.json': evidence,
  'drift.json': drift,
})) {
  const bytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`);
  await writeFile(join(output, name), bytes, { flag: 'wx' });
  digests[name] = hashBytes(bytes);
}
const counts = {};
for (const entry of report.entries) {
  const key = `${entry.kind}:${entry.status}`;
  counts[key] = (counts[key] ?? 0) + 1;
}
const fullCoverageCandidates = (pattern) =>
  pattern.candidates.filter(
    (candidate) =>
      candidate.fullDateCoverage &&
      !candidate.platformConflicts.length &&
      !candidate.boardingConflicts.length,
  );
const summary = {
  schemaVersion: 1,
  identity,
  currentCaptureSha256: capture.sha256,
  historicalManifestSha256: historical.input.manifestSha256,
  digests,
  proposalCounts: counts,
  approval: 'Agent-proposed evidence only; no human-reviewed mapping decisions',
  agencyEvidence: evidence.agencies.map((agency) => ({
    providerId: agency.providerId,
    referencedRouteCount: agency.referencedRouteIds.length,
    suggestedDisposition: agency.suggestedDisposition,
  })),
  ambiguousStops: evidence.ambiguousStops,
  patternEvidence: {
    total: evidence.patterns.length,
    noSequenceCandidate: evidence.patterns.filter(
      (pattern) => !pattern.candidates.length,
    ).length,
    unresolvedPatternIds: evidence.patterns
      .filter((pattern) => !pattern.candidates.length)
      .map((pattern) => pattern.providerId),
    sequenceCandidatesButNoFullDateCoverage: evidence.patterns.filter(
      (pattern) =>
        pattern.candidates.length &&
        !pattern.candidates.some((candidate) => candidate.fullDateCoverage),
    ).length,
    fullDateCoverageButPlatformConflict: evidence.patterns.filter(
      (pattern) =>
        pattern.candidates.some((candidate) => candidate.fullDateCoverage) &&
        !fullCoverageCandidates(pattern).length,
    ).length,
    noFullDateAndPlatformCandidate: evidence.patterns.filter(
      (pattern) => !fullCoverageCandidates(pattern).length,
    ).length,
    oneFullDateAndPlatformCandidate: evidence.patterns.filter(
      (pattern) => fullCoverageCandidates(pattern).length === 1,
    ).length,
    multipleFullDateAndPlatformCandidates: evidence.patterns.filter(
      (pattern) => fullCoverageCandidates(pattern).length > 1,
    ).length,
  },
  driftTables: drift.tables,
  generationEligible: false,
};
await writeFile(
  join(output, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(
  JSON.stringify(
    {
      output: resolve(output),
      patternEvidence: summary.patternEvidence,
      generationEligible: false,
    },
    null,
    2,
  ),
);
