import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  auditSchedule,
  readSchedule,
} from '../packages/fs/dist/gtfs/schedule.js';
import { writeGtfsTimetableReleaseFiles } from '../packages/fs/dist/gtfs/timetableExport.js';
import {
  applyScheduledPlatformAllocationServiceMemberships,
  applyScheduledSourceJourneyServiceMemberships,
  buildScopedReviewBlockers,
  createGroupedScopedReconciliationDraft,
  createScheduledCombinedReview,
  createScheduledCombinedTripAssignmentProposals,
  createScheduledHolidayMappingDraft,
  createScheduledHolidayReviewDraft,
  createScheduledPlatformAllocationMappingDraft,
  createScheduledPlatformAssociationReview,
  createScheduledSourceJourneyMappingDraft,
  createScheduledTripAssignmentProposals,
  createScopedReconciliationDraft,
  evaluateGroupedScopedReconciliation,
  evaluateScheduledCombinedMapping,
  evaluateScheduledHolidayMapping,
  evaluateScheduledPlatformAllocationMapping,
  evaluateScheduledSourceJourneyMapping,
  evaluateScopedReconciliation,
  groupedScopedReviewDraftSha256,
  hashBytes,
  inspectCombinedTimetableRelease,
  inspectGtfsTripAssignments,
  listEntities,
  prepareCombinedTimetableArtifact,
  readEntity,
  readVerifiedCapture,
  scheduledHolidayMappingDraftSha256,
  scheduledPlatformAllocationMappingDraftSha256,
  scheduledSourceJourneyMappingDraftSha256,
  scheduleTopologyProjection,
  scopedReviewDraftSha256,
  verifyScheduledPlatformAssociationReview,
} from '../packages/fs/dist/index.js';

const [file, captureFile, pilotLineList, output, ...extra] =
  process.argv.slice(2);
let requestedCommit;
let applicabilityPolicyFile;
let combinedReviewFile;
let combinedApprovalFile;
let combinedAssignments = false;
let combinedArtifact = false;
let combinedReleaseFile;
let platformGroups = false;
let includeBlockers = false;
let includeAssignments = false;
let holidayPolicyFile;
let holidayCalendarId;
let holidayReviewFile;
let holidayMappingFile;
let holidayApprovalFile;
let platformAllocationPolicyFile;
let platformAllocationReviewFile;
let platformAllocationApprovalFile;
let sharedServiceMembershipsFile;
let platformAssociationPolicyFile;
let platformAssociationReviewFile;
let sourceJourneyPolicyFile;
let sourceJourneyReviewFile;
let sourceJourneyApprovalFile;
for (let index = 0; index < extra.length; index++) {
  if (extra[index] === '--combined-assignments' && !combinedAssignments) {
    combinedAssignments = true;
  } else if (extra[index] === '--combined-artifact' && !combinedArtifact) {
    combinedArtifact = true;
  } else if (
    extra[index] === '--combined-release' &&
    !combinedReleaseFile &&
    extra[index + 1]
  ) {
    combinedReleaseFile = extra[++index];
  } else if (
    extra[index] === '--combined-approval' &&
    !combinedApprovalFile &&
    extra[index + 1]
  ) {
    combinedApprovalFile = extra[++index];
  } else if (
    extra[index] === '--applicability-policy' &&
    !applicabilityPolicyFile &&
    extra[index + 1]
  ) {
    applicabilityPolicyFile = extra[++index];
  } else if (
    extra[index] === '--combined-review' &&
    !combinedReviewFile &&
    extra[index + 1]
  ) {
    combinedReviewFile = extra[++index];
  } else if (
    extra[index] === '--shared-service-memberships' &&
    !sharedServiceMembershipsFile &&
    extra[index + 1]
  ) {
    sharedServiceMembershipsFile = extra[++index];
  } else if (
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
    extra[index] === '--platform-allocation-policy' &&
    !platformAllocationPolicyFile &&
    extra[index + 1]
  ) {
    platformAllocationPolicyFile = extra[++index];
  } else if (
    extra[index] === '--platform-allocation-review' &&
    !platformAllocationReviewFile &&
    extra[index + 1]
  ) {
    platformAllocationReviewFile = extra[++index];
  } else if (
    extra[index] === '--platform-allocation-approval' &&
    !platformAllocationApprovalFile &&
    extra[index + 1]
  ) {
    platformAllocationApprovalFile = extra[++index];
  } else if (
    extra[index] === '--platform-association-policy' &&
    !platformAssociationPolicyFile &&
    extra[index + 1]
  ) {
    platformAssociationPolicyFile = extra[++index];
  } else if (
    extra[index] === '--platform-association-review' &&
    !platformAssociationReviewFile &&
    extra[index + 1]
  ) {
    platformAssociationReviewFile = extra[++index];
  } else if (
    extra[index] === '--source-journey-policy' &&
    !sourceJourneyPolicyFile &&
    extra[index + 1]
  ) {
    sourceJourneyPolicyFile = extra[++index];
  } else if (
    extra[index] === '--source-journey-review' &&
    !sourceJourneyReviewFile &&
    extra[index + 1]
  ) {
    sourceJourneyReviewFile = extra[++index];
  } else if (
    extra[index] === '--source-journey-approval' &&
    !sourceJourneyApprovalFile &&
    extra[index + 1]
  ) {
    sourceJourneyApprovalFile = extra[++index];
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
    'Usage: node scripts/draft-gtfs-scoped-review.mjs <schedule.zip> <capture.json> <pilot-line-id[,pilot-line-id...]> <new-output-directory> [--canonical-commit <full-sha>] [--applicability-policy <json> [--combined-review <json>] [--combined-approval <json>] [--combined-assignments] [--combined-artifact] | --combined-release <settings.json>] [--shared-service-memberships <json>] [--platform-association-policy <json> [--platform-association-review <json>]] [--platform-groups] [--blockers] [--assignments] [--holiday-policy <json> --holiday-calendar <canonical-id> [--holiday-date-review <json>] [--holiday-mapping <json>] [--holiday-approval <json>] | --platform-allocation-policy <json> [--platform-allocation-review <json>] [--platform-allocation-approval <json>] | --source-journey-policy <json> [--source-journey-review <json>] [--source-journey-approval <json>]]',
  );
}
if (
  (applicabilityPolicyFile &&
    (!platformAssociationPolicyFile ||
      !sourceJourneyPolicyFile ||
      !platformAllocationPolicyFile ||
      !holidayPolicyFile ||
      platformAssociationReviewFile ||
      platformAllocationReviewFile ||
      platformAllocationApprovalFile ||
      sourceJourneyReviewFile ||
      sourceJourneyApprovalFile)) ||
  ((combinedReviewFile ||
    combinedApprovalFile ||
    combinedAssignments ||
    combinedArtifact ||
    combinedReleaseFile) &&
    !applicabilityPolicyFile)
) {
  throw new Error(
    'Combined review requires explicit applicability, association, journey, allocation and holiday policies and its own saved review',
  );
}
if (combinedReleaseFile && (combinedAssignments || combinedArtifact)) {
  throw new Error(
    'Combined release cannot be combined with inspection artifact or assignment output',
  );
}
if (
  (platformAssociationPolicyFile &&
    !applicabilityPolicyFile &&
    (!platformAllocationPolicyFile ||
      platformAllocationReviewFile ||
      platformAllocationApprovalFile ||
      sharedServiceMembershipsFile ||
      sourceJourneyPolicyFile ||
      sourceJourneyReviewFile ||
      sourceJourneyApprovalFile)) ||
  (platformAssociationReviewFile && !platformAssociationPolicyFile)
) {
  throw new Error(
    'Platform associations require allocation and holiday policies and cannot combine with mapping, approval, shared-service or source-journey inputs',
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
  (platformAllocationPolicyFile &&
    (!holidayPolicyFile ||
      holidayReviewFile ||
      holidayMappingFile ||
      holidayApprovalFile)) ||
  (!platformAllocationPolicyFile &&
    (platformAllocationReviewFile ||
      platformAllocationApprovalFile ||
      sharedServiceMembershipsFile))
) {
  throw new Error(
    'Platform allocation review requires a holiday policy and its own review and approval records',
  );
}
if (
  (sourceJourneyPolicyFile &&
    (!platformAllocationPolicyFile ||
      platformAllocationReviewFile ||
      platformAllocationApprovalFile)) ||
  (!sourceJourneyPolicyFile &&
    (sourceJourneyReviewFile || sourceJourneyApprovalFile))
) {
  throw new Error(
    'Source journey review requires platform and holiday policies and its own review/approval files',
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
if (platformAllocationPolicyFile) {
  const readJson = async (path) =>
    JSON.parse(await readFile(resolve(path), 'utf8'));
  const [policy, holidayPolicy, { value: holidays }] = await Promise.all([
    readJson(platformAllocationPolicyFile),
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
      'Platform allocation review pilot must match the bound holiday policy families',
    );
  }
  if (applicabilityPolicyFile) {
    const inputs = {
      context,
      captureSha256: capture.sha256,
      applicabilityPolicy: await readJson(applicabilityPolicyFile),
      associationPolicy: await readJson(platformAssociationPolicyFile),
      sourceJourneyPolicy: await readJson(sourceJourneyPolicyFile),
      allocationPolicy: policy,
      holidayPolicy,
      holidayCalendar: holidays,
      ...(sharedServiceMembershipsFile
        ? {
            sharedServiceMemberships: await readJson(
              sharedServiceMembershipsFile,
            ),
          }
        : {}),
    };
    const review = combinedReviewFile
      ? await readJson(combinedReviewFile)
      : createScheduledCombinedReview(inputs);
    const approval = combinedApprovalFile
      ? await readJson(combinedApprovalFile)
      : undefined;
    if (combinedReleaseFile) {
      const settings = await readJson(combinedReleaseFile);
      const { bundle, ...candidate } = inspectCombinedTimetableRelease(
        inputs,
        review,
        capture,
        {
          ...settings,
          mappingApproval: approval,
        },
      );
      const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
      const directory = await writeGtfsTimetableReleaseFiles(
        output,
        join(cwd, 'data'),
        {
          'summary.json': json(candidate),
          ...(bundle
            ? {
                'manifest.json': bundle.files.manifestBytes,
                'timetable.json': bundle.files.timetableBytes,
                'release.json': bundle.files.releaseBytes,
                'release-index.json': json(bundle.index),
              }
            : {}),
        },
      );
      console.log(json({ output: directory, ...candidate }));
      process.exit(candidate.release.eligible ? 0 : 1);
    }
    const artifact = combinedArtifact
      ? prepareCombinedTimetableArtifact(inputs, review, capture, approval)
      : undefined;
    const proposals =
      artifact?.proposals ??
      (combinedAssignments
        ? createScheduledCombinedTripAssignmentProposals(
            inputs,
            review,
            approval,
          )
        : undefined);
    const evaluation = proposals
      ? proposals.review
      : evaluateScheduledCombinedMapping(inputs, review, approval);
    const summary = {
      schemaVersion: 1,
      documentKind: 'gtfs-combined-schedule-review-summary',
      captureSha256: capture.sha256,
      identity: review.identity,
      draftSha256: review.draftSha256,
      accounting: review.accounting,
      unresolvedEntities: review.unresolvedEntities,
      evaluation,
      approval: approval
        ? 'Supplied exact-report mapping approval evaluated; generation remains ineligible'
        : 'No approval; combined review is separate from passenger access and publication',
      ...(proposals
        ? {
            assignmentsSha256: proposals.assignmentsSha256,
            assignmentCoverage: proposals.document.coverage,
          }
        : {}),
      ...(artifact
        ? {
            artifact: {
              file: 'combined-timetable.json',
              sha256: artifact.artifactSha256,
              byteLength: artifact.artifactBytes.byteLength,
            },
          }
        : {}),
      generationEligible: false,
    };
    await mkdir(resolve(output));
    for (const [name, content] of Object.entries({
      'combined-review.json': review,
      'combined-evaluation.json': evaluation,
      'summary.json': summary,
      ...(combinedAssignments && proposals
        ? { 'combined-assignments.json': proposals.document }
        : {}),
    })) {
      await writeFile(
        join(output, name),
        `${JSON.stringify(content, null, name === 'combined-assignments.json' ? undefined : 2)}\n`,
        { flag: 'wx' },
      );
    }
    if (artifact) {
      await writeFile(
        join(output, 'combined-timetable.json'),
        artifact.artifactBytes,
        { flag: 'wx' },
      );
    }
    console.log(
      JSON.stringify({ output: resolve(output), ...summary }, null, 2),
    );
    process.exit(evaluation.valid ? 0 : 1);
  }
  if (platformAssociationPolicyFile) {
    const inputs = {
      context,
      captureSha256: capture.sha256,
      policy: await readJson(platformAssociationPolicyFile),
      allocationPolicy: policy,
      holidayPolicy,
      holidayCalendar: holidays,
    };
    const review = platformAssociationReviewFile
      ? await readJson(platformAssociationReviewFile)
      : createScheduledPlatformAssociationReview(inputs);
    const evaluation = platformAssociationReviewFile
      ? verifyScheduledPlatformAssociationReview(inputs, review)
      : {
          valid: true,
          draftSha256: review.draftSha256,
          mappingReviewEligible: false,
          generationEligible: false,
        };
    const summary = {
      schemaVersion: 1,
      documentKind: 'gtfs-platform-association-review-summary',
      captureSha256: capture.sha256,
      identity: review.identity,
      draftSha256: review.draftSha256,
      accounting: review.accounting,
      evaluation,
      approval:
        'No mapping approval; platform association is separate from passenger boarding permission',
      generationEligible: false,
    };
    await mkdir(resolve(output));
    for (const [name, content] of Object.entries({
      'platform-association-review.json': review,
      'platform-association-evaluation.json': evaluation,
      'summary.json': summary,
    })) {
      await writeFile(
        join(output, name),
        `${JSON.stringify(content, null, 2)}\n`,
        { flag: 'wx' },
      );
    }
    console.log(
      JSON.stringify({ output: resolve(output), ...summary }, null, 2),
    );
    process.exit(0);
  }
  const journeyPolicy = sourceJourneyPolicyFile
    ? await readJson(sourceJourneyPolicyFile)
    : undefined;
  const reviewFile = journeyPolicy
    ? sourceJourneyReviewFile
    : platformAllocationReviewFile;
  const approvalFile = journeyPolicy
    ? sourceJourneyApprovalFile
    : platformAllocationApprovalFile;
  let review = reviewFile
    ? await readJson(reviewFile)
    : journeyPolicy
      ? createScheduledSourceJourneyMappingDraft(
          context,
          journeyPolicy,
          policy,
          holidayPolicy,
          holidays,
        )
      : createScheduledPlatformAllocationMappingDraft(
          context,
          policy,
          holidayPolicy,
          holidays,
        );
  if (sharedServiceMembershipsFile) {
    const claims = await readJson(sharedServiceMembershipsFile);
    review = journeyPolicy
      ? applyScheduledSourceJourneyServiceMemberships(
          context,
          journeyPolicy,
          policy,
          holidayPolicy,
          holidays,
          review,
          claims,
        )
      : applyScheduledPlatformAllocationServiceMemberships(
          context,
          policy,
          holidayPolicy,
          holidays,
          review,
          claims,
        );
  }
  const approval = approvalFile ? await readJson(approvalFile) : undefined;
  const evaluation = journeyPolicy
    ? evaluateScheduledSourceJourneyMapping(
        context,
        journeyPolicy,
        policy,
        holidayPolicy,
        holidays,
        review,
        approval,
      )
    : evaluateScheduledPlatformAllocationMapping(
        context,
        policy,
        holidayPolicy,
        holidays,
        review,
        approval,
      );
  const outputStem = journeyPolicy ? 'source-journey' : 'platform-allocation';
  const summary = {
    schemaVersion: 1,
    documentKind: `gtfs-${outputStem}-review-summary`,
    captureSha256: capture.sha256,
    identity: review.identity,
    draftSha256: journeyPolicy
      ? scheduledSourceJourneyMappingDraftSha256(review)
      : scheduledPlatformAllocationMappingDraftSha256(review),
    changes: journeyPolicy ? review.platformChanges : review.changes,
    ...(journeyPolicy
      ? { sourceJourneyCount: journeyPolicy.journeys.length }
      : {}),
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
    [`${outputStem}-review.json`]: review,
    [`${outputStem}-evaluation.json`]: evaluation,
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
