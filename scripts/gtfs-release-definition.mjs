import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  GtfsCaptureSchema,
  ScheduledTimetableSourceReviewSchema,
} from '@mrtdown/core';
import z from 'zod';
import { acquirePublicGtfsCapture } from '../packages/cli/dist/gtfsAcquisition.js';
import {
  CombinedTimetableReleaseIndexSchema,
  GtfsTimetableReleaseReviewSchema,
  GtfsTimetableTermsSchema,
  hashBytes,
  readVerifiedCapture,
  singaporeCaptureDate,
} from '../packages/fs/dist/index.js';
import { combinedPagesConfigSchema } from './export-pages-combined-timetable.mjs';

export const releaseDefinitionPath = 'releases/gtfs.json';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const policyNames = [
  'applicabilityPolicy',
  'associationPolicy',
  'sourceJourneyPolicy',
  'allocationPolicy',
  'holidayPolicy',
  'sharedServiceMemberships',
];
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;

// The definition is reviewed text. Raw source and generated timetable rows stay outside Git.
export const releaseDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-release-definition'),
    capture: GtfsCaptureSchema,
    canonicalCommit: z.string().regex(/^[a-f0-9]{40}$/),
    holidayCalendarId: z.string().min(1),
    correctionRevision: z.number().int().nonnegative(),
    draftSha256: digest,
    policies: z
      .object({
        applicabilityPolicy: z.json(),
        associationPolicy: z.json(),
        sourceJourneyPolicy: z.json(),
        allocationPolicy: z.json(),
        holidayPolicy: z.json(),
        sharedServiceMemberships: z.json().optional(),
      })
      .strict(),
    // Preserve JSON property order so compact serialization reproduces the approved evidence bytes.
    releaseEvidence: z.json(),
    sourceReview: ScheduledTimetableSourceReviewSchema,
    releaseIndex: CombinedTimetableReleaseIndexSchema,
    preparationPolicySha256: digest.nullable(),
  })
  .strict();

export function validateReleaseDefinition(value) {
  const definition = releaseDefinitionSchema.parse(value);
  const {
    capture,
    releaseEvidence: evidence,
    sourceReview,
    releaseIndex,
  } = definition;
  const review = GtfsTimetableReleaseReviewSchema.parse(evidence.releaseReview);
  GtfsTimetableTermsSchema.parse(evidence.currentTerms);
  if (
    capture.feed_kind !== 'schedule' ||
    capture.rights_status !== 'redistribution_permitted' ||
    evidence.documentKind !== 'gtfs-combined-timetable-release-evidence' ||
    hashBytes(Buffer.from(JSON.stringify(evidence))) !==
      releaseIndex.releaseSha256 ||
    evidence.mappingApproval.draftSha256 !== definition.draftSha256 ||
    review.manifestSha256 !== releaseIndex.manifestSha256 ||
    sourceReview.successor.manifestSha256 !== releaseIndex.manifestSha256 ||
    sourceReview.successor.snapshotSha256 !== capture.sha256
  )
    throw new Error('GTFS release definition identities or evidence differ');
  return definition;
}

export async function readReleaseDefinition(file) {
  let bytes;
  try {
    bytes = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return validateReleaseDefinition(JSON.parse(bytes));
}

export function assertBootstrapAllowed(repo, path = releaseDefinitionPath) {
  if (
    execFileSync('git', ['log', '-1', '--format=%H', '--', path], {
      cwd: repo,
      encoding: 'utf8',
    }).trim()
  ) {
    throw new Error(
      'The desired GTFS definition was removed; restore an explicit reviewed definition',
    );
  }
}

export async function createReleaseDefinition(inputDir, policyPath = null) {
  const config = combinedPagesConfigSchema.parse(
    await json(join(inputDir, 'combined-pages.json')),
  );
  if (!config.approvedRelease || !config.draftSha256 || config.draft)
    throw new Error('A compact approved GTFS release is required');
  // Configured inputs may only be regular files within the prepared directory.
  const root = await realpath(inputDir);
  async function input(name) {
    const path = resolve(inputDir, name);
    if (
      !(await realpath(path)).startsWith(`${root}/`) ||
      !(await lstat(path)).isFile()
    )
      throw new Error(
        'GTFS definition inputs must be regular files inside the input directory',
      );
    return json(path);
  }
  const policies = {};
  for (const name of policyNames)
    if (config[name]) policies[name] = await input(config[name]);
  const { capture } = await readVerifiedCapture(
    join(inputDir, 'schedule.zip'),
    join(inputDir, 'capture.json'),
  );
  return validateReleaseDefinition({
    schemaVersion: 1,
    documentKind: 'gtfs-release-definition',
    capture,
    canonicalCommit: config.canonicalCommit,
    holidayCalendarId: config.holidayCalendarId,
    correctionRevision: config.correctionRevision,
    draftSha256: config.draftSha256,
    policies,
    releaseEvidence: await input(config.approvedRelease.evidence),
    sourceReview: await input('source-review.json'),
    releaseIndex: await input(config.approvedRelease.index),
    preparationPolicySha256: policyPath
      ? hashBytes(await readFile(policyPath))
      : null,
  });
}

/** An ordinary redeploy keeps using the desired release, including after its capture ages. */
export function checkReleaseTransition(
  value,
  completedIndex,
  { now = new Date().toISOString(), policyBytes } = {},
) {
  const definition = validateReleaseDefinition(value);
  if (isDeepStrictEqual(definition.releaseIndex, completedIndex))
    return 'redeploy';
  if (
    definition.sourceReview.predecessor?.manifestSha256 !==
    completedIndex.manifestSha256
  )
    throw new Error(
      'Desired GTFS release does not follow the completed predecessor; prepare a fresh review',
    );
  if (definition.preparationPolicySha256) {
    if (
      !policyBytes ||
      hashBytes(policyBytes) !== definition.preparationPolicySha256
    )
      throw new Error(
        'GTFS preparation policy changed; prepare a fresh review',
      );
    const policy = JSON.parse(policyBytes.toString());
    const age = Date.parse(now) - Date.parse(definition.capture.retrieved_at);
    if (!(age >= 0 && age <= policy.maximumCaptureAgeHours * 3600000))
      throw new Error('Desired GTFS capture is stale; prepare a fresh review');
  }
  const range = definition.policies.applicabilityPolicy.serviceDateRange;
  const today = singaporeCaptureDate(now);
  if (!(today >= range.startDate && today < range.endDateExclusive))
    throw new Error('Desired GTFS service-date window is not active');
  return 'successor';
}

export async function materializeReleaseDefinition(
  value,
  outputDir,
  origin,
  acquire = acquirePublicGtfsCapture,
) {
  const definition = validateReleaseDefinition(value);
  await mkdir(outputDir);
  try {
    const acquired = await acquire(
      origin,
      `captures/schedule/${definition.capture.sha256}.json`,
      join(outputDir, 'acquired'),
    );
    const bytes = await readFile(acquired.file);
    if (
      hashBytes(bytes) !== definition.capture.sha256 ||
      bytes.length !== definition.capture.byte_length
    )
      throw new Error('GTFS source differs from the reviewed hash or size');
    const config = {
      schemaVersion: 1,
      canonicalCommit: definition.canonicalCommit,
      holidayCalendarId: definition.holidayCalendarId,
      correctionRevision: definition.correctionRevision,
      draftSha256: definition.draftSha256,
      ...Object.fromEntries(
        Object.keys(definition.policies).map((name) => [name, `${name}.json`]),
      ),
      mappingApproval: 'mappingApproval.json',
      releaseReview: 'releaseReview.json',
      approvedRelease: {
        index: 'release-index.json',
        evidence: 'release-evidence.json',
      },
    };
    const files = {
      ...Object.fromEntries(
        Object.entries(definition.policies).map(([name, value]) => [
          `${name}.json`,
          value,
        ]),
      ),
      'combined-pages.json': config,
      'capture.json': definition.capture,
      'mappingApproval.json': definition.releaseEvidence.mappingApproval,
      'releaseReview.json': definition.releaseEvidence.releaseReview,
      'release-index.json': definition.releaseIndex,
      'source-review.json': definition.sourceReview,
    };
    for (const [name, value] of Object.entries(files))
      await writeFile(join(outputDir, name), encode(value), { flag: 'wx' });
    await writeFile(
      join(outputDir, 'release-evidence.json'),
      JSON.stringify(definition.releaseEvidence),
      { flag: 'wx' },
    );
    await writeFile(join(outputDir, 'schedule.zip'), bytes, { flag: 'wx' });
    await rm(join(outputDir, 'acquired'), { recursive: true, force: true });
    return definition;
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const [mode, input, output, policyPath] = process.argv.slice(2);
  if (mode === 'create') {
    const definition = await createReleaseDefinition(input, policyPath);
    await writeFile(output, encode(definition));
  } else if (mode === 'assert-current') {
    const desired = await readReleaseDefinition(input);
    if (!desired) assertBootstrapAllowed('.', input);
    else if (
      !isDeepStrictEqual(
        desired.releaseIndex,
        await json(join(output, 'release-index.json')),
      )
    )
      throw new Error(
        'The desired GTFS release is still pending; finish its deployment before preparing another',
      );
  } else if (mode === 'materialize') {
    const desired = await readReleaseDefinition(input);
    if (!desired) throw new Error('Missing desired GTFS release definition');
    await materializeReleaseDefinition(
      desired,
      output,
      // biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime acquisition is not cached.
      process.env.GTFS_SNAPSHOT_BASE_URL,
    );
  } else if (mode === 'validate') {
    const desired = await readReleaseDefinition(input);
    if (!desired) {
      assertBootstrapAllowed('.', input);
      console.log('No desired GTFS definition has been adopted yet');
    } else
      console.log(
        `Verified GTFS definition ${desired.releaseIndex.manifestSha256}`,
      );
  } else
    throw new Error(
      'Expected create, materialize, assert-current or validate mode',
    );
}
