import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  GtfsReconciliationIdentitySchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import {
  CombinedTimetableReleaseIndexSchema,
  hashBytes,
  inspectCombinedTimetableRelease,
  readEntity,
  readScheduleTopology,
  readVerifiedCapture,
  verifyCombinedTimetableReleaseBundle,
} from '@mrtdown/fs';
import z from 'zod';
import {
  acquireGtfsTerms,
  gtfsLicenceReference,
} from '../packages/cli/dist/gtfsTerms.js';
import {
  readSchedule,
  readScheduleFeedRange,
} from '../packages/fs/dist/gtfs/schedule.js';

const recordPath = z.string().trim().min(1);
const configSchema = ScheduledTimetableArtifactMetadataSchema.pick({
  correctionRevision: true,
})
  .extend({
    schemaVersion: z.literal(1),
    canonicalCommit: GtfsReconciliationIdentitySchema.shape.canonicalCommit,
    holidayCalendarId: z.string().trim().min(1),
    applicabilityPolicy: recordPath,
    associationPolicy: recordPath,
    sourceJourneyPolicy: recordPath,
    allocationPolicy: recordPath,
    holidayPolicy: recordPath,
    sharedServiceMemberships: recordPath.optional(),
    draft: recordPath,
    mappingApproval: recordPath,
    releaseReview: recordPath,
    approvedRelease: z
      .object({ index: recordPath, evidence: recordPath })
      .strict()
      .optional(),
  })
  .strict();

/** Include the directory itself and distinguish parent traversal from names beginning with dots. */
function contains(directory, path) {
  const rel = relative(directory, path);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Read the review inputs and return an exporter that binds them to the staged data. */
export async function prepareCombinedTimetableExport({
  gtfsFile,
  gtfsCapture,
  gtfsCombinedConfig,
  outDir,
}) {
  const actualOutDir = resolve(
    await realpath(dirname(outDir)),
    relative(dirname(outDir), outDir),
  );
  /** Keep inputs outside the directory the successful build replaces. */
  async function assertInputPath(path) {
    if (
      contains(outDir, path) ||
      contains(actualOutDir, await realpath(path))
    ) {
      throw new Error('--out-dir must not contain timetable inputs');
    }
  }

  await Promise.all(
    [gtfsFile, gtfsCapture, gtfsCombinedConfig].map(assertInputPath),
  );
  const {
    schemaVersion: _,
    canonicalCommit,
    correctionRevision,
    holidayCalendarId,
    approvedRelease,
    ...recordPaths
  } = configSchema.parse(await readJson(gtfsCombinedConfig));
  const resolveInput = async (name) => {
    const path = resolve(dirname(gtfsCombinedConfig), name);
    await assertInputPath(path);
    return path;
  };
  const records = Object.fromEntries(
    await Promise.all(
      Object.entries(recordPaths).map(async ([key, name]) => [
        key,
        await readJson(await resolveInput(name)),
      ]),
    ),
  );
  const { draft, mappingApproval, releaseReview, ...policies } = records;
  const approvedIndex = approvedRelease
    ? CombinedTimetableReleaseIndexSchema.parse(
        await readJson(await resolveInput(approvedRelease.index)),
      )
    : undefined;
  const approvedEvidence = approvedRelease
    ? await readFile(await resolveInput(approvedRelease.evidence))
    : undefined;

  /** Rebuild and verify the release before writing the site's three bundle files. */
  return async (dataDir) => {
    const [{ capture, bytes }, topology, { value: holidayCalendar }] =
      await Promise.all([
        readVerifiedCapture(gtfsFile, gtfsCapture),
        readScheduleTopology(dataDir),
        readEntity(dataDir, 'public-holiday', holidayCalendarId),
      ]);
    if (capture.feed_kind !== 'schedule') {
      throw new Error(
        'Combined timetable packaging requires a schedule capture',
      );
    }
    const { tables, manifest: sourceManifest } = readSchedule(bytes);
    readScheduleFeedRange(tables['feed_info.txt'] ?? []);
    const currentTerms = await acquireGtfsTerms();
    const { bundle, release } = inspectCombinedTimetableRelease(
      {
        ...policies,
        context: {
          tables,
          topology,
          identity: {
            sourceManifest,
            canonicalCommit,
            topology: {
              projectionVersion: topology.projectionVersion,
              sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
            },
          },
        },
        captureSha256: capture.sha256,
        holidayCalendar,
      },
      draft,
      capture,
      {
        correctionRevision,
        currentLicenceReference: gtfsLicenceReference,
        mappingApproval,
        releaseReview,
        currentTerms,
        releaseInstant: new Date().toISOString(),
      },
    );
    if (!bundle) {
      throw new Error(
        `Combined timetable publication blocked: ${release.blockers.join('; ')}`,
      );
    }
    // Recheck current eligibility above, then publish the exact reviewed evidence.
    if (approvedEvidence) {
      const fresh = JSON.parse(bundle.files.releaseBytes.toString('utf8'));
      const approved = JSON.parse(approvedEvidence.toString('utf8'));
      if (
        !isDeepStrictEqual(approved, {
          ...fresh,
          releaseInstant: approved.releaseInstant,
        })
      ) {
        throw new Error(
          'Approved release evidence differs from the fresh check',
        );
      }
    }
    const index = approvedIndex ?? bundle.index;
    const files = {
      ...bundle.files,
      releaseBytes: approvedEvidence ?? bundle.files.releaseBytes,
    };
    const { manifest } = verifyCombinedTimetableReleaseBundle(
      index,
      files,
      topology,
    );
    const directory = resolve(dataDir, 'combined-timetable');
    await mkdir(directory);
    await writeFile(resolve(directory, 'manifest.json'), files.manifestBytes);
    await writeFile(resolve(directory, 'timetable.json'), files.timetableBytes);
    await writeFile(resolve(directory, 'release.json'), files.releaseBytes);
    return { index, manifest };
  };
}
