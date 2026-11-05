import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  auditSchedule,
  readSchedule,
} from '../packages/fs/dist/gtfs/schedule.js';
import {
  buildScopedReviewBlockers,
  createGroupedScopedReconciliationDraft,
  createScheduledHolidayMappingDraft,
  createScheduledHolidayReviewDraft,
  createScheduledPlatformLabelMappingDraft,
  createScheduledTripAssignmentProposals,
  createScopedReconciliationDraft,
  evaluateGroupedScopedReconciliation,
  evaluateScheduledHolidayMapping,
  evaluateScheduledPlatformLabelMapping,
  evaluateScopedReconciliation,
  groupedScopedReviewDraftSha256,
  hashBytes,
  inspectGtfsTripAssignments,
  listEntities,
  readEntity,
  readVerifiedCapture,
  scheduledHolidayMappingDraftSha256,
  scheduledPlatformLabelMappingDraftSha256,
  scheduleTopologyProjection,
  scopedReviewDraftSha256,
} from '../packages/fs/dist/index.js';

const [file, captureFile, pilotLineList, output, ...extra] =
  process.argv.slice(2);
let requestedCommit;
let platformGroups = false;
let includeBlockers = false;
let includeAssignments = false;
let holidayPolicyFile;
let holidayCalendarId;
let holidayReviewFile;
let holidayMappingFile;
let holidayApprovalFile;
let platformLabelPolicyFile;
let platformLabelReviewFile;
let platformLabelApprovalFile;
for (let index = 0; index < extra.length; index++) {
  if (
    extra[index] === '--holiday-policy' &&
    !holidayPolicyFile &&
    extra[index + 1]
  ) {
    holidayPolicyFile = extra[++index];
  } else if (
    extra[index] === '--holiday-calendar' &&
    !holidayCalendarId &&
    extra[index + 1]
  ) {
    holidayCalendarId = extra[++index];
  } else if (
    extra[index] === '--holiday-date-review' &&
    !holidayReviewFile &&
    extra[index + 1]
  ) {
    holidayReviewFile = extra[++index];
  } else if (
    extra[index] === '--holiday-mapping' &&
    !holidayMappingFile &&
    extra[index + 1]
  ) {
    holidayMappingFile = extra[++index];
  } else if (
    extra[index] === '--holiday-approval' &&
    !holidayApprovalFile &&
    extra[index + 1]
  ) {
    holidayApprovalFile = extra[++index];
  } else if (
    extra[index] === '--platform-label-policy' &&
    !platformLabelPolicyFile &&
    extra[index + 1]
  ) {
    platformLabelPolicyFile = extra[++index];
  } else if (
    extra[index] === '--platform-label-review' &&
    !platformLabelReviewFile &&
    extra[index + 1]
  ) {
    platformLabelReviewFile = extra[++index];
  } else if (
    extra[index] === '--platform-label-approval' &&
    !platformLabelApprovalFile &&
    extra[index + 1]
  ) {
    platformLabelApprovalFile = extra[++index];
  } else if (extra[index] === '--blockers' && !includeBlockers) {
    includeBlockers = true;
  } else if (extra[index] === '--assignments' && !includeAssignments) {
    includeAssignments = true;
  } else if (extra[index] === '--platform-groups' && !platformGroups) {
    platformGroups = true;
  } else if (
    extra[index] === '--canonical-commit' &&
    !requestedCommit &&
    /^[a-f0-9]{40}$/.test(extra[index + 1] ?? '')
  ) {
    requestedCommit = extra[++index];
  } else {
    throw new Error('Unknown, duplicate or invalid scoped-review option');
  }
}
if (!file || !captureFile || !pilotLineList || !output) {
  throw new Error(
    'Usage: node scripts/draft-gtfs-scoped-review.mjs <schedule.zip> <capture.json> <pilot-line-id[,pilot-line-id...]> <new-output-directory> [--canonical-commit <full-sha>] [--platform-groups] [--blockers] [--assignments] [--holiday-policy <json> --holiday-calendar <canonical-id> [--holiday-date-review <json>] [--holiday-mapping <json>] [--holiday-approval <json>] | --platform-label-policy <json> [--platform-label-review <json>] [--platform-label-approval <json>]]',
  );
}
if (
  Boolean(holidayPolicyFile) !== Boolean(holidayCalendarId) ||
  (!holidayPolicyFile &&
    (holidayReviewFile || holidayMappingFile || holidayApprovalFile)) ||
  (holidayPolicyFile &&
    (platformGroups || includeBlockers || includeAssignments))
) {
  throw new Error(
    'Holiday date review requires both policy and calendar; mapping/assignment options are separate',
  );
}
if (
  (platformLabelPolicyFile &&
    (!holidayPolicyFile ||
      holidayReviewFile ||
      holidayMappingFile ||
      holidayApprovalFile)) ||
  (!platformLabelPolicyFile &&
    (platformLabelReviewFile || platformLabelApprovalFile))
) {
  throw new Error(
    'Platform-label review requires a holiday policy and its own review and approval records',
  );
}
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
if (platformLabelPolicyFile) {
  const readJson = async (path) =>
    JSON.parse(await readFile(resolve(path), 'utf8'));
  const [policy, holidayPolicy, { value: holidays }] = await Promise.all([
    readJson(platformLabelPolicyFile),
    readJson(holidayPolicyFile),
    readEntity(join(cwd, 'data'), 'public-holiday', holidayCalendarId),
  ]);
  const policyLines = [
    ...new Set(holidayPolicy.families.map((family) => family.lineId)),
  ].sort();
  if (
    JSON.stringify([...new Set(pilotLineIds)].sort()) !==
    JSON.stringify(policyLines)
  ) {
    throw new Error(
      'Platform-label review pilot must match the bound holiday policy families',
    );
  }
  const review = platformLabelReviewFile
    ? await readJson(platformLabelReviewFile)
    : createScheduledPlatformLabelMappingDraft(
        context,
        policy,
        holidayPolicy,
        holidays,
      );
  const approval = platformLabelApprovalFile
    ? await readJson(platformLabelApprovalFile)
    : undefined;
  const evaluation = evaluateScheduledPlatformLabelMapping(
    context,
    policy,
    holidayPolicy,
    holidays,
    review,
    approval,
  );
  const summary = {
    schemaVersion: 1,
    documentKind: 'gtfs-platform-label-review-summary',
    captureSha256: capture.sha256,
    identity: review.identity,
    draftSha256: scheduledPlatformLabelMappingDraftSha256(review),
    changes: review.changes,
    patternCount: review.dateReview.patterns.length,
    effectiveTripDateCount: review.dateReview.patterns.reduce(
      (total, pattern) =>
        total + pattern.tripIds.length * pattern.serviceDates.length,
      0,
    ),
    approval: approval
      ? 'Supplied repository-review metadata evaluated'
      : 'No approval metadata supplied; all matches are draft proposals',
    evaluation,
    generationEligible: false,
  };
  await mkdir(resolve(output));
  for (const [name, content] of Object.entries({
    'platform-label-review.json': review,
    'platform-label-evaluation.json': evaluation,
    'summary.json': summary,
  })) {
    await writeFile(
      join(output, name),
      `${JSON.stringify(content, null, 2)}\n`,
      { flag: 'wx' },
    );
  }
  console.log(JSON.stringify({ output: resolve(output), ...summary }, null, 2));
  process.exit(evaluation.valid ? 0 : 1);
}
if (holidayPolicyFile) {
  const policy = JSON.parse(await readFile(resolve(holidayPolicyFile), 'utf8'));
  const { value: holidays } = await readEntity(
    join(cwd, 'data'),
    'public-holiday',
    holidayCalendarId,
  );
  const readJson = async (path) =>
    JSON.parse(await readFile(resolve(path), 'utf8'));
  const review = holidayReviewFile
    ? await readJson(holidayReviewFile)
    : createScheduledHolidayReviewDraft(context, policy, holidays);
  const mapping = holidayMappingFile
    ? await readJson(holidayMappingFile)
    : createScheduledHolidayMappingDraft(context, policy, holidays, review, {
        preparedBy: 'MRTDown deterministic holiday-mapping proposal tool',
      });
  const approval = holidayApprovalFile
    ? await readJson(holidayApprovalFile)
    : undefined;
  const evaluation = evaluateScheduledHolidayMapping(
    context,
    policy,
    holidays,
    review,
    mapping,
    approval,
  );
  const policyLines = [
    ...new Set(review.policy.families.map((family) => family.lineId)),
  ].sort();
  if (
    JSON.stringify([...new Set(pilotLineIds)].sort()) !==
    JSON.stringify(policyLines)
  ) {
    throw new Error(
      'Holiday review pilot must match the explicitly bound policy families',
    );
  }
  const reviewBytes = Buffer.from(`${JSON.stringify(review, null, 2)}\n`);
  const tripDateCount = (field) =>
    review.patterns.reduce(
      (total, pattern) =>
        total + pattern.tripIds.length * pattern[field].length,
      0,
    );
  const summary = {
    schemaVersion: 1,
    documentKind: 'gtfs-holiday-date-review-summary',
    identity: review.identity,
    captureSha256: capture.sha256,
    draftSha256: review.draftSha256,
    reviewFile: {
      sha256: hashBytes(reviewBytes),
      byteLength: reviewBytes.length,
    },
    patternCount: review.patterns.length,
    sourceTripDateCount: tripDateCount('sourceServiceDates'),
    effectiveTripDateCount: tripDateCount('serviceDates'),
    addedTripDateCount: tripDateCount('addedServiceDates'),
    removedTripDateCount: tripDateCount('removedServiceDates'),
    unresolvedPatternDateCount: review.patterns.reduce(
      (total, pattern) =>
        total +
        pattern.reviewCells
          .filter((cell) => cell.disposition === 'unresolved')
          .reduce((count, cell) => count + cell.serviceDates.length, 0),
      0,
    ),
    mapping: {
      draftSha256: scheduledHolidayMappingDraftSha256(mapping),
      approval: approval
        ? 'Supplied repository-review metadata evaluated'
        : 'No approval metadata supplied; all matches are draft proposals',
      evaluation,
    },
    mappingReviewEligible: evaluation.mappingReviewEligible,
    generationEligible: false,
  };
  await mkdir(resolve(output));
  await writeFile(join(output, 'holiday-date-review.json'), reviewBytes, {
    flag: 'wx',
  });
  for (const [name, content] of Object.entries({
    'holiday-mapping-draft.json': mapping,
    'holiday-mapping-evaluation.json': evaluation,
  })) {
    await writeFile(
      join(output, name),
      `${JSON.stringify(content, null, 2)}\n`,
      { flag: 'wx' },
    );
  }
  await writeFile(
    join(output, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(JSON.stringify({ output: resolve(output), ...summary }, null, 2));
  process.exit(evaluation.valid ? 0 : 1);
}
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
let assignmentSummary;
if (includeAssignments) {
  const proposals = createScheduledTripAssignmentProposals(context, full);
  const validation = await inspectGtfsTripAssignments(
    resolve(file),
    resolve(captureFile),
    {
      dataDir: join(cwd, 'data'),
      canonicalCommit,
      assignments: proposals.document,
      coverage: true,
    },
  );
  files['assignments.json'] = proposals.document;
  files['assignment-validation.json'] = validation;
  assignmentSummary = {
    draftSha256: proposals.draftSha256,
    assignmentsSha256: validation.assignmentsSha256,
    assignmentCount: validation.assignmentCount,
    tripCount: validation.tripCount,
    tripDateCount: validation.tripDateCount,
    sourceTripDateCount: validation.coverage.sourceTripDateCount,
    missingTripDateCount: validation.coverage.missingTripDateCount,
    tripDateCoverageComplete: validation.coverage.tripDateCoverageComplete,
    generationEligible: false,
  };
}
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
  ...(assignmentSummary ? { assignmentProposals: assignmentSummary } : {}),
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
      ...(assignmentSummary ? { assignmentProposals: assignmentSummary } : {}),
    },
    null,
    2,
  ),
);
