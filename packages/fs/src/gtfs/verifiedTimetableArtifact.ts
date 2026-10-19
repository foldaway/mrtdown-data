import {
  GtfsReconciliationIdentitySchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import z from 'zod';
import { compactAssignedTimetable } from './assignedTimetable.js';
import { scheduledTripAssignmentCoverage } from './assignmentCoverage.js';
import { createScheduledTripAssignmentProposals } from './assignmentProposals.js';
import { hashBytes, readVerifiedCapture } from './capture.js';
import { readSchedule } from './schedule.js';
import { prepareScheduledTimetableArtifact } from './timetableArtifact.js';
import { readScheduleTopology } from './topology.js';

const settingsSchema = ScheduledTimetableArtifactMetadataSchema.pick({
  correctionRevision: true,
  currentLicenceReference: true,
}).extend({ mappingVersion: z.string().min(1) });

export interface VerifiedGtfsTimetableArtifactOptions
  extends z.infer<typeof settingsSchema> {
  dataDir: string;
  canonicalCommit: string;
  draft: unknown;
}

function providerDate(value: string | undefined, field: string) {
  if (!value || !/^\d{8}$/.test(value)) {
    throw new Error(
      `Artifact preparation requires a dated feed_info.txt ${field}`,
    );
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

/** The caller supplies the exact canonical data tree for the recorded commit. */
export async function prepareVerifiedGtfsTimetableArtifact(
  file: string,
  handoff: string,
  options: VerifiedGtfsTimetableArtifactOptions,
) {
  const { dataDir, canonicalCommit, draft, ...inputSettings } = options;
  const settings = settingsSchema.parse(inputSettings);
  const commit =
    GtfsReconciliationIdentitySchema.shape.canonicalCommit.parse(
      canonicalCommit,
    );
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind !== 'schedule') {
    throw new Error('Artifact preparation requires a schedule capture');
  }
  const { tables, manifest } = readSchedule(bytes);
  const sourceFeedInfo = tables['feed_info.txt'] ?? [];
  if (sourceFeedInfo.length !== 1) {
    throw new Error(
      'Artifact preparation requires exactly one feed_info.txt record',
    );
  }
  const feedRange =
    ScheduledTimetableArtifactMetadataSchema.shape.feedRange.parse({
      startDate: providerDate(
        sourceFeedInfo[0].feed_start_date,
        'feed_start_date',
      ),
      endDate: providerDate(sourceFeedInfo[0].feed_end_date, 'feed_end_date'),
    });
  const topology = await readScheduleTopology(dataDir);
  const identity = GtfsReconciliationIdentitySchema.parse({
    sourceManifest: manifest,
    canonicalCommit: commit,
    topology: {
      projectionVersion: topology.projectionVersion,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  });
  const proposals = createScheduledTripAssignmentProposals(
    { tables, topology, identity },
    draft,
  );
  const assignments = proposals.document.assignments;
  const timetable = compactAssignedTimetable(tables, assignments);
  const artifact = prepareScheduledTimetableArtifact(timetable, {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-artifact',
    correctionRevision: settings.correctionRevision,
    capture,
    identity,
    mapping: {
      version: settings.mappingVersion,
      draftSha256: proposals.draftSha256,
      assignmentsSha256: hashBytes(Buffer.from(JSON.stringify(assignments))),
    },
    feedRange,
    sourceFeedInfo,
    currentLicenceReference: settings.currentLicenceReference,
    mrtdownLicence: 'CC-BY-4.0',
  });
  return {
    ...artifact,
    review: proposals.review,
    coverage: scheduledTripAssignmentCoverage(tables, assignments),
  };
}
