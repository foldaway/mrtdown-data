import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  GtfsReconciliationIdentitySchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import {
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

/** Enforce the site index's canonical boarding rules for approved source allocations. */
function assertIndexableBoarding(artifact, topology) {
  const stations = new Map(
    topology.stations.map((station) => [station.id, station]),
  );
  const usedPatterns = new Set(
    artifact.assignments.map(({ patternId }) => patternId),
  );
  for (const patternId of usedPatterns) {
    const { lineId, calls } = artifact.patterns[patternId];
    for (const { stationId, platforms } of calls) {
      for (const { platformId, accessByService } of platforms) {
        const canonical = stations
          .get(stationId)
          ?.platforms.find(({ id }) => id === platformId);
        for (const {
          serviceId,
          passengerBoardingEligible,
        } of accessByService) {
          if (
            passengerBoardingEligible &&
            (!canonical ||
              canonical.lineId !== lineId ||
              canonical.boardingStatus ||
              (canonical.serviceIds.length &&
                !canonical.serviceIds.includes(serviceId)))
          ) {
            throw new Error(
              `Combined timetable boarding access differs from canonical topology for ${serviceId} at ${stationId}/${platformId}`,
            );
          }
        }
      }
    }
  }
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
    ...recordPaths
  } = configSchema.parse(await readJson(gtfsCombinedConfig));
  const records = Object.fromEntries(
    await Promise.all(
      Object.entries(recordPaths).map(async ([key, name]) => {
        const path = resolve(dirname(gtfsCombinedConfig), name);
        await assertInputPath(path);
        return [key, await readJson(path)];
      }),
    ),
  );
  const { draft, mappingApproval, releaseReview, ...policies } = records;

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
    const { index, files } = bundle;
    const { manifest, artifact } = verifyCombinedTimetableReleaseBundle(
      index,
      files,
      topology,
    );
    assertIndexableBoarding(artifact, topology);
    const directory = resolve(dataDir, 'combined-timetable');
    await mkdir(directory);
    await writeFile(resolve(directory, 'manifest.json'), files.manifestBytes);
    await writeFile(resolve(directory, 'timetable.json'), files.timetableBytes);
    await writeFile(resolve(directory, 'release.json'), files.releaseBytes);
    return { index, manifest };
  };
}
