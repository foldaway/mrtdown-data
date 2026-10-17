import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  auditSchedule,
  readSchedule,
} from '../packages/fs/dist/gtfs/schedule.js';
import {
  buildScopedReviewBlockers,
  createGroupedScopedReconciliationDraft,
  createScopedReconciliationDraft,
  evaluateGroupedScopedReconciliation,
  evaluateScopedReconciliation,
  groupedScopedReviewDraftSha256,
  hashBytes,
  listEntities,
  readVerifiedCapture,
  scheduleTopologyProjection,
  scopedReviewDraftSha256,
} from '../packages/fs/dist/index.js';

const [file, captureFile, pilotLineList, output, ...extra] =
  process.argv.slice(2);
let requestedCommit;
let platformGroups = false;
let includeBlockers = false;
for (let index = 0; index < extra.length; index++) {
  if (extra[index] === '--blockers' && !includeBlockers) includeBlockers = true;
  else if (extra[index] === '--platform-groups' && !platformGroups)
    platformGroups = true;
  else if (
    extra[index] === '--canonical-commit' &&
    !requestedCommit &&
    /^[a-f0-9]{40}$/.test(extra[index + 1] ?? '')
  )
    requestedCommit = extra[++index];
  else throw new Error('Unknown, duplicate or invalid scoped-review option');
}
if (!file || !captureFile || !pilotLineList || !output)
  throw new Error(
    'Usage: node scripts/draft-gtfs-scoped-review.mjs <schedule.zip> <capture.json> <pilot-line-id[,pilot-line-id...]> <new-output-directory> [--canonical-commit <full-sha>] [--platform-groups] [--blockers]',
  );
const createDraft = platformGroups
  ? createGroupedScopedReconciliationDraft
  : createScopedReconciliationDraft;
const evaluateDraft = platformGroups
  ? evaluateGroupedScopedReconciliation
  : evaluateScopedReconciliation;
const draftSha256 = platformGroups
  ? groupedScopedReviewDraftSha256
  : scopedReviewDraftSha256;
const pilotLineIds = pilotLineList.split(',').map((id) => id.trim());
if (pilotLineIds.some((id) => !id))
  throw new Error('Pilot line IDs must not be empty');
const cwd = resolve(import.meta.dirname, '..');
const dirty = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', 'data'],
  { cwd, encoding: 'utf8' },
);
if (dirty.trim()) throw new Error('Canonical data must match committed HEAD');
const canonicalCommit = execFileSync(
  'git',
  [
    'rev-parse',
    '--verify',
    requestedCommit ? `${requestedCommit}^{commit}` : 'HEAD',
  ],
  { cwd, encoding: 'utf8' },
).trim();
execFileSync('git', ['diff', '--quiet', canonicalCommit, '--', 'data'], {
  cwd,
});
const { capture, bytes } = await readVerifiedCapture(
  resolve(file),
  resolve(captureFile),
);
if (capture.feed_kind !== 'schedule')
  throw new Error('Requires verified schedule capture');
const { tables, manifest } = readSchedule(bytes);
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
  sourceManifest: manifest,
  canonicalCommit,
  topology: {
    projectionVersion: 1,
    sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
  },
};
const context = { tables, identity, topology };
const full = createDraft(context, {
  pilotLineIds,
  preparedBy: 'MRTDown deterministic scoped-review proposal tool',
});
const selected = full.decisions.filter(
  (item) => item.disposition === 'matched',
);
const used = new Set(
  selected
    .filter((item) => item.kind === 'pattern')
    .map((item) => item.dateSetId),
);
const pilot = {
  ...full,
  dateSets: full.dateSets.filter((set) => used.has(set.id)),
  decisions: selected,
};
const fullEvaluation = evaluateDraft(context, full);
const pilotEvaluation = evaluateDraft(context, pilot);
if (
  !fullEvaluation.valid ||
  !fullEvaluation.coverageComplete ||
  !pilotEvaluation.valid
)
  throw new Error(
    `Generated draft failed validation: ${JSON.stringify({ full: fullEvaluation.errors, pilot: pilotEvaluation.errors })}`,
  );
const files = {
  'full-draft.json': full,
  'pilot-draft.json': pilot,
  'full-evaluation.json': fullEvaluation,
  'pilot-evaluation.json': pilotEvaluation,
};
if (includeBlockers)
  files['blockers.json'] = buildScopedReviewBlockers(context, full);
await mkdir(resolve(output));
const digests = {};
for (const [name, content] of Object.entries(files)) {
  const bytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`);
  await writeFile(join(output, name), bytes, { flag: 'wx' });
  digests[name] = { sha256: hashBytes(bytes), byteLength: bytes.length };
}
const evaluationSummary = (result) => ({
  valid: result.valid,
  coverageComplete: result.coverageComplete,
  missingEntryCount: result.missingEntries.length,
  missingPatternDateCount: result.missingPatternDates.reduce(
    (total, item) => total + item.serviceDates.length,
    0,
  ),
  unresolvedDecisions: result.unresolvedDecisions,
  matchedPatternDates: result.matchedPatternDates,
  excludedPatternDates: result.excludedPatternDates,
  approvalMatches: result.approvalMatches,
  readiness: result.readiness,
  mappingReviewEligible: result.mappingReviewEligible,
  generationEligible: false,
});
const unresolved = full.decisions.filter(
  (item) => item.disposition === 'unresolved',
);
const entities = Object.fromEntries(
  ['agency', 'route', 'stop'].map((kind) => [
    kind,
    unresolved
      .filter((item) => item.kind === kind)
      .map((item) => item.providerId),
  ]),
);
const unresolvedPatterns = unresolved
  .filter((item) => item.kind === 'pattern')
  .map((item) => ({ providerId: item.providerId, dateSetId: item.dateSetId }));
const patternsByDateSet = Object.fromEntries(
  [...new Set(unresolvedPatterns.map((item) => item.dateSetId))]
    .sort()
    .map((id) => [
      id,
      unresolvedPatterns
        .filter((item) => item.dateSetId === id)
        .map((item) => item.providerId),
    ]),
);
const audit = auditSchedule(tables);
const entityByKey = new Map(
  selected
    .filter((item) => item.kind !== 'pattern')
    .map((item) => [`${item.kind}:${item.providerId}`, item]),
);
const patterns = selected
  .filter((item) => item.kind === 'pattern')
  .map((item) => {
    const pattern = audit.patterns.find(
      (pattern) => pattern.id === item.providerId,
    );
    if (!pattern) throw new Error('Unknown pilot pattern');
    const from = pattern.stopIds[0],
      to = pattern.stopIds.at(-1);
    return {
      providerId: item.providerId,
      sourceRecordSha256: item.sourceRecordSha256,
      routeId: pattern.routeId,
      calendarId: pattern.calendarId,
      direction: pattern.direction,
      target: item.target,
      dateSetId: item.dateSetId,
      tripCount: pattern.tripIds.length,
      providerStopCount: pattern.stopIds.length,
      fromStopId: from,
      toStopId: to,
      fromStationId: entityByKey.get(`stop:${from}`)?.target?.stationId,
      toStationId: entityByKey.get(`stop:${to}`)?.target?.stationId,
      sourceTripIdsSha256: hashBytes(
        Buffer.from(JSON.stringify(pattern.tripIds)),
      ),
    };
  });
const summary = {
  schemaVersion: platformGroups ? 3 : 2,
  documentKind: 'gtfs-scoped-mapping-draft-summary',
  identity,
  captureSha256: capture.sha256,
  preparedBy: full.preparedBy,
  pilotLineIds: full.pilotLineIds,
  approval: 'No approval metadata supplied; all matches are draft proposals',
  digests,
  fullDraft: {
    normalizedSha256: draftSha256(full),
    decisionCount: full.decisions.length,
    evaluation: evaluationSummary(fullEvaluation),
  },
  pilotDraft: {
    normalizedSha256: draftSha256(pilot),
    decisionCount: pilot.decisions.length,
    evaluation: evaluationSummary(pilotEvaluation),
  },
  pilotDecisionCounts: Object.fromEntries(
    ['agency', 'route', 'stop', 'pattern'].map((kind) => [
      kind,
      selected.filter((item) => item.kind === kind).length,
    ]),
  ),
  pilotPatterns: patterns,
  pilotTripCount: patterns.reduce(
    (total, pattern) => total + pattern.tripCount,
    0,
  ),
  pilotStationParentCount: selected.filter(
    (item) => item.kind === 'stop' && item.target?.kind === 'station',
  ).length,
  pilotPlatformCount: selected.filter(
    (item) => item.kind === 'stop' && item.target?.kind === 'platform',
  ).length,
  ...(platformGroups
    ? {
        pilotPlatformGroupCount: selected.filter(
          (item) =>
            item.kind === 'stop' && item.target?.kind === 'platformGroup',
        ).length,
      }
    : {}),
  globalUnresolvedInventory: {
    sha256: hashBytes(Buffer.from(JSON.stringify(unresolved))),
    count: unresolved.length,
    entities,
    patternsByDateSet,
  },
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
      pilotDecisionCounts: summary.pilotDecisionCounts,
      fullEvaluation: summary.fullDraft.evaluation,
      pilotEvaluation: summary.pilotDraft.evaluation,
    },
    null,
    2,
  ),
);
