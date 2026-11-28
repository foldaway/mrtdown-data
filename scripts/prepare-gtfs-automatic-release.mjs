import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  acquireGtfsTerms,
  gtfsLicenceReference,
} from '../packages/cli/dist/gtfsTerms.js';
import {
  readSchedule,
  readScheduleFeedRange,
} from '../packages/fs/dist/gtfs/schedule.js';
import { fingerprint } from '../packages/fs/dist/gtfs/scopedReviewContract.js';
import {
  createScheduledCombinedReview,
  createScheduledSourceJourneyMappingDraft,
  groupedScopedReviewDraftSha256,
  hashBytes,
  inspectCombinedTimetableRelease,
  readEntity,
  readScheduleTopology,
  readVerifiedCapture,
  singaporeCaptureDate,
  verifyCombinedTimetableReleaseBundle,
} from '../packages/fs/dist/index.js';
import { combinedPagesConfigSchema } from './export-pages-combined-timetable.mjs';
import {
  assessAutomaticUpdate,
  automaticPublicationPolicySchema,
} from './gtfs-automatic-eligibility.mjs';
import {
  checkAutomaticDailyChanges,
  planAutomaticMappings,
} from './gtfs-automatic-mapping.mjs';
import { assessExpiredServiceCleanup } from './gtfs-expired-service-cleanup.mjs';
import { assessRetainedTimetableNoop } from './gtfs-retained-timetable-noop.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const policyNames = [
  'applicabilityPolicy',
  'associationPolicy',
  'sourceJourneyPolicy',
  'allocationPolicy',
  'holidayPolicy',
  'sharedServiceMemberships',
];
export class AutomaticPublicationHold extends Error {}
function requireCheck(condition, reason) {
  if (!condition) throw new AutomaticPublicationHold(reason);
}

/** Compare the independently reconstructed targets and passenger access, not source pattern counts. */
export function mappingSemantics(draft) {
  return draft.associationReview.patterns.map((pattern) => ({
    id: pattern.providerPatternId,
    dates: pattern.supportedServiceDates,
    cells: pattern.reviewCells,
    platforms: pattern.platformAssociations,
  }));
}

export function prepareAutomaticRelease({
  baselineInputs,
  previousCapture,
  baselineConfig,
  baselineEvidence,
  baselineIndex,
  tables,
  sourceManifest,
  capture,
  policy: policyInput,
  currentTerms,
  now,
  runUrl,
  progress = () => {},
}) {
  const policy = automaticPublicationPolicySchema.parse(policyInput);
  const assessment = assessAutomaticUpdate({
    baseline: baselineInputs.context.tables,
    candidate: tables,
    previousCapture,
    capture,
    policy,
    now,
  });
  if (assessment.decision !== 'eligible') return assessment;
  readScheduleFeedRange(baselineInputs.context.tables['feed_info.txt'] ?? []);
  readScheduleFeedRange(tables['feed_info.txt'] ?? []);
  requireCheck(
    new URL(runUrl).origin === 'https://github.com' &&
      /^\/foldaway\/mrtdown-data\/actions\/runs\/\d+$/.test(
        new URL(runUrl).pathname,
      ),
    'Automatic approval requires the actual trusted workflow run.',
  );
  requireCheck(
    isDeepStrictEqual(currentTerms, baselineEvidence.currentTerms),
    'The licence or API terms changed.',
  );
  const range = baselineInputs.applicabilityPolicy.serviceDateRange;
  const today = singaporeCaptureDate(now);
  requireCheck(
    today >= range.startDate && today < range.endDateExclusive,
    'The approved service-date window has expired or has not started.',
  );
  requireCheck(
    baselineEvidence.releaseReview.effectiveAt === null,
    'A release with a reviewed Effective Date needs a new review.',
  );

  progress('Reconstructing baseline mappings');
  const baselineDraft = createScheduledCombinedReview(baselineInputs);
  requireCheck(
    baselineDraft.draftSha256 ===
      (baselineConfig.draftSha256 ??
        baselineEvidence.mappingApproval.draftSha256),
    'The baseline draft no longer reconstructs exactly.',
  );
  const options = {
    correctionRevision: baselineConfig.correctionRevision,
    currentLicenceReference: gtfsLicenceReference,
    currentTerms,
    releaseInstant: baselineEvidence.releaseInstant,
    mappingApproval: baselineEvidence.mappingApproval,
    releaseReview: baselineEvidence.releaseReview,
  };
  progress('Verifying baseline release');
  const baseline = inspectCombinedTimetableRelease(
    baselineInputs,
    baselineDraft,
    previousCapture,
    options,
  );
  requireCheck(
    baseline.bundle && isDeepStrictEqual(baseline.bundle.index, baselineIndex),
    'The previously approved release no longer verifies against current canonical data and holidays.',
  );
  verifyCombinedTimetableReleaseBundle(
    baselineIndex,
    baseline.bundle.files,
    baselineInputs.context.topology,
  );

  if (policy.scope === 'canonical-schedule') {
    const cleanup = assessExpiredServiceCleanup(
      baselineInputs.context.tables,
      tables,
      now,
    );
    if (cleanup)
      return {
        decision: 'no-op',
        reasons: [
          `Only expired service dates changed (${cleanup.serviceDates.join(', ')}); keep the completed timetable and its historical schedules unchanged.`,
        ],
        retainedManifestSha256: baselineIndex.manifestSha256,
        historicalChanges: cleanup,
      };
  }

  const inputs = {
    ...baselineInputs,
    context: {
      ...baselineInputs.context,
      tables,
      identity: { ...baselineInputs.context.identity, sourceManifest },
    },
    captureSha256: capture.sha256,
    captureRetrievedAt: capture.retrieved_at,
  };
  const provenance = `Automatic policy ${policy.revision} (${fingerprint(policy)}); ${runUrl}. Verified predecessor ${baselineIndex.manifestSha256}; source dates and canonical paths checked under this standing policy. Preserve reviewed access, terms and applicability.`;
  for (const name of policyNames) {
    if (!baselineInputs[name]) continue;
    inputs[name] = structuredClone(baselineInputs[name]);
    if ('sourceManifest' in inputs[name])
      inputs[name].sourceManifest = sourceManifest;
    if ('captureSha256' in inputs[name])
      inputs[name].captureSha256 = capture.sha256;
  }
  if (inputs.applicabilityPolicy.captureServiceDate !== undefined)
    inputs.applicabilityPolicy.captureServiceDate = singaporeCaptureDate(
      capture.retrieved_at,
    );
  inputs.applicabilityPolicy.basis = provenance;
  if (policy.scope === 'canonical-schedule') {
    progress('Planning source calendars and canonical memberships');
    try {
      planAutomaticMappings(
        baselineInputs,
        inputs,
        provenance,
        requireCheck,
        policy.revision === 'canonical-schedule-v3',
      );
    } catch (error) {
      throw new AutomaticPublicationHold(
        `Calendar or mapping planning requires review: ${error.message}`,
      );
    }
  } else if (inputs.sharedServiceMemberships) {
    progress('Reconstructing shared memberships');
    const grouped = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    inputs.sharedServiceMemberships.baseDraftSha256 =
      groupedScopedReviewDraftSha256(grouped.mapping.mapping);
  }
  if (policy.revision === 'canonical-schedule-v3') {
    progress('Proving whether the published timetable can remain unchanged');
    const proof = assessRetainedTimetableNoop(baselineInputs, inputs, now);
    if (proof)
      return {
        decision: 'no-op',
        reasons: [
          `All remaining approved service is unchanged. Differences affect ${proof.expiredServiceDates.length} completed service date(s) within the approved window and ${proof.outsideApprovedServiceDates.length} date(s) outside it; retain the published source, timetable and historical schedules unchanged. No service-date approval is extended.`,
        ],
        retainedManifestSha256: baselineIndex.manifestSha256,
        retainedTimetableProof: {
          ...proof,
          baselineCaptureSha256: previousCapture.sha256,
          candidateCaptureSha256: capture.sha256,
          retainedManifestSha256: baselineIndex.manifestSha256,
          policyRevision: policy.revision,
          policySha256: fingerprint(policy),
        },
      };
  }
  progress('Reconstructing candidate mappings');
  const draft = createScheduledCombinedReview(inputs);
  requireCheck(
    draft.unresolvedEntities === 0 &&
      draft.accounting.unresolvedTripDateCount === 0 &&
      draft.accounting.excludedTripDateCount === 0,
    'Mappings contain unresolved or excluded trip/date pairs.',
  );
  if (policy.scope === 'canonical-schedule') {
    progress('Checking daily counts and station timing changes');
    checkAutomaticDailyChanges(
      baselineInputs,
      baselineDraft,
      inputs,
      draft,
      policy,
      requireCheck,
    );
  } else {
    requireCheck(
      isDeepStrictEqual(
        mappingSemantics(baselineDraft),
        mappingSemantics(draft),
      ),
      'Reconstructed memberships, service dates or passenger access changed.',
    );
  }
  const reviewer = `GTFS automatic publication (${policy.revision})`;
  const mappingApproval = {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-mapping-approval',
    identity: draft.identity,
    draftSha256: draft.draftSha256,
    reviewer,
    reason: provenance,
  };
  const candidateOptions = {
    ...options,
    mappingApproval,
    releaseReview: undefined,
    releaseInstant: now,
  };
  progress('Preparing candidate manifest');
  const candidate = inspectCombinedTimetableRelease(
    inputs,
    draft,
    capture,
    candidateOptions,
  );
  const releaseReview = {
    ...baselineEvidence.releaseReview,
    manifestSha256: candidate.manifestSha256,
    mappingApprovalSha256: candidate.manifest.mappingApprovalSha256,
    reviewer,
    reviewedAt: now,
    captureConditions: `${policy.captureConditions}\n${provenance}`,
    terms: currentTerms,
  };
  progress('Verifying candidate release');
  const result = inspectCombinedTimetableRelease(inputs, draft, capture, {
    ...candidateOptions,
    releaseReview,
  });
  requireCheck(
    result.bundle,
    `Release validation failed: ${result.release.blockers.join('; ')}`,
  );
  progress('Checking complete candidate bundle');
  const verified = verifyCombinedTimetableReleaseBundle(
    result.bundle.index,
    result.bundle.files,
    inputs.context.topology,
  );
  const sourceReview = {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-source-review',
    // Match consumer admission: only equal nonempty provider versions conflict.
    decision:
      verified.artifact.sourceFeedInfo[0]?.feed_version &&
      baselineInputs.context.tables['feed_info.txt']?.[0]?.feed_version ===
        verified.artifact.sourceFeedInfo[0].feed_version
        ? 'resolve-version-conflict'
        : 'successor',
    predecessor: {
      manifestSha256: baselineIndex.manifestSha256,
      snapshotSha256: previousCapture.sha256,
    },
    successor: {
      manifestSha256: result.bundle.index.manifestSha256,
      snapshotSha256: capture.sha256,
    },
    reviewer,
    reviewedAt: now,
    reason: `${provenance} Admit only this checked, newer capture; an unchanged nonempty provider version requires explicit conflict resolution.`,
  };
  return {
    decision: 'ready',
    reasons: [],
    inputs,
    draft,
    mappingApproval,
    releaseReview,
    sourceReview,
    bundle: result.bundle,
    coverage: verified.artifact.coverage,
    serviceDateRange: range,
    provenance,
  };
}

/** Files come only from the trusted retained recipe, never from a capture PR checkout. */
export async function prepareAutomaticReleaseFiles({
  baselineDir,
  candidateDir,
  outputDir,
  dataDir,
  policyPath,
  now,
  runUrl,
  terms = acquireGtfsTerms,
  progress = () => {},
}) {
  const config = combinedPagesConfigSchema.parse(
    await json(join(baselineDir, 'combined-pages.json')),
  );
  requireCheck(
    config.approvedRelease,
    'The baseline has no approved release index.',
  );
  const records = Object.fromEntries(
    await Promise.all(
      policyNames
        .filter((name) => config[name])
        .map(async (name) => [
          name,
          await json(resolve(baselineDir, config[name])),
        ]),
    ),
  );
  const [
    previous,
    candidate,
    topology,
    { value: holidayCalendar },
    baselineEvidence,
    baselineIndex,
    policy,
  ] = await Promise.all([
    readVerifiedCapture(
      join(baselineDir, 'schedule.zip'),
      join(baselineDir, 'capture.json'),
    ),
    readVerifiedCapture(
      join(candidateDir, 'schedule.zip'),
      join(candidateDir, 'capture.json'),
    ),
    readScheduleTopology(dataDir),
    readEntity(dataDir, 'public-holiday', config.holidayCalendarId),
    json(resolve(baselineDir, config.approvedRelease.evidence)),
    json(resolve(baselineDir, config.approvedRelease.index)),
    json(policyPath),
  ]);
  const baselineSource = readSchedule(previous.bytes);
  const source = readSchedule(candidate.bytes);
  const baselineInputs = {
    ...records,
    context: {
      tables: baselineSource.tables,
      topology,
      identity: {
        sourceManifest: baselineSource.manifest,
        canonicalCommit: config.canonicalCommit,
        topology: {
          projectionVersion: topology.projectionVersion,
          sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
        },
      },
    },
    captureSha256: previous.capture.sha256,
    captureRetrievedAt: previous.capture.retrieved_at,
    holidayCalendar,
  };
  // Assess source changes before fetching terms or constructing a large review.
  const assessment = assessAutomaticUpdate({
    baseline: baselineSource.tables,
    candidate: source.tables,
    previousCapture: previous.capture,
    capture: candidate.capture,
    policy,
    now,
  });
  if (assessment.decision !== 'eligible') return assessment;
  const result = prepareAutomaticRelease({
    progress,
    baselineInputs,
    previousCapture: previous.capture,
    baselineConfig: config,
    baselineEvidence,
    baselineIndex,
    tables: source.tables,
    sourceManifest: source.manifest,
    capture: candidate.capture,
    policy,
    currentTerms: await terms(),
    now,
    runUrl,
  });
  if (result.decision === 'no-op')
    return {
      ...result,
      preparation: {
        captureSha256: candidate.capture.sha256,
        captureRetrievedAt: candidate.capture.retrieved_at,
        baselineCaptureSha256: previous.capture.sha256,
        baselineReleaseIndex: baselineIndex,
        serviceDateRange: baselineInputs.applicabilityPolicy.serviceDateRange,
        checkedAt: now,
        runUrl,
      },
    };
  if (result.decision !== 'ready') return result;
  await mkdir(outputDir);
  const compact = {
    ...config,
    draftSha256: result.draft.draftSha256,
    mappingApproval: 'mappingApproval.json',
    releaseReview: 'releaseReview.json',
    approvedRelease: {
      index: 'release-index.json',
      evidence: 'release-evidence.json',
    },
  };
  delete compact.draft;
  for (const name of policyNames) {
    if (!result.inputs[name]) {
      delete compact[name];
      continue;
    }
    compact[name] = `${name}.json`;
    await writeFile(
      join(outputDir, compact[name]),
      encode(result.inputs[name]),
      { flag: 'wx' },
    );
  }
  const files = {
    'combined-pages.json': compact,
    'mappingApproval.json': result.mappingApproval,
    'releaseReview.json': result.releaseReview,
    'source-review.json': result.sourceReview,
    'capture.json': candidate.capture,
    'release-index.json': result.bundle.index,
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(join(outputDir, name), encode(value), { flag: 'wx' });
  await writeFile(
    join(outputDir, 'release-evidence.json'),
    result.bundle.files.releaseBytes,
    { flag: 'wx' },
  );
  await copyFile(
    join(candidateDir, 'schedule.zip'),
    join(outputDir, 'schedule.zip'),
  );
  return {
    decision: 'ready',
    reasons: [],
    releaseIndex: result.bundle.index,
    coverage: result.coverage,
    serviceDateRange: result.serviceDateRange,
    provenance: result.provenance,
    preparation: {
      captureSha256: candidate.capture.sha256,
      captureRetrievedAt: candidate.capture.retrieved_at,
      baselineCaptureSha256: previous.capture.sha256,
      baselineReleaseIndex: baselineIndex,
      serviceDateRange: baselineInputs.applicabilityPolicy.serviceDateRange,
      checkedAt: now,
      runUrl,
    },
  };
}

export function renderAutomaticPublicationReport(result) {
  const proof = result.retainedTimetableProof
    ? `\n<details>\n<summary>Retained timetable proof</summary>\n\n\`\`\`json\n${JSON.stringify(result.retainedTimetableProof, null, 2)}\n\`\`\`\n\n</details>\n`
    : '';
  const receipt =
    result.decision === 'no-op' && result.preparation
      ? `\n<details>\n<summary>No-op preparation receipt</summary>\n\n\`\`\`json\n${JSON.stringify({ preparation: result.preparation, ...(result.historicalChanges ? { historicalChanges: result.historicalChanges } : {}) }, null, 2)}\n\`\`\`\n\n</details>\n`
      : '';
  return `## Automatic publication\n\nDecision: **${result.decision}**.\n\n${result.reasons.map((reason) => `- ${reason}`).join('\n')}\n${result.serviceDateRange ? `\nApproved service dates: ${result.serviceDateRange.startDate} through ${result.serviceDateRange.endDateExclusive} (exclusive). Zero unassigned supported trip/date pairs.\n` : ''}${proof}${receipt}`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [baselineDir, candidateDir, outputDir, reportDir] =
    process.argv.slice(2);
  if (!reportDir)
    throw new Error(
      'Usage: prepare-gtfs-automatic-release.mjs <baseline> <candidate> <new-output> <report-dir>',
    );
  const env = process.env;
  let result;
  try {
    result = await prepareAutomaticReleaseFiles({
      baselineDir,
      candidateDir,
      outputDir,
      dataDir: 'data',
      policyPath: 'docs/gtfs/operations/automatic-publication-policy.json',
      now: new Date().toISOString(),
      runUrl: env.REVIEW_RUN_URL,
      progress: (message) => console.log(message),
    });
  } catch (error) {
    if (!(error instanceof AutomaticPublicationHold)) throw error;
    result = { decision: 'hold', reasons: [error.message] };
  }
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, 'automatic-publication.json'),
    encode(result),
  );
  const message = renderAutomaticPublicationReport(result);
  await writeFile(join(reportDir, 'automatic-publication.md'), message);
  if (env.GITHUB_OUTPUT)
    await writeFile(
      env.GITHUB_OUTPUT,
      `publish=${result.decision === 'ready'}\ndecision=${result.decision}\n`,
      { flag: 'a' },
    );
  if (env.GITHUB_STEP_SUMMARY)
    await writeFile(env.GITHUB_STEP_SUMMARY, message, { flag: 'a' });
}
