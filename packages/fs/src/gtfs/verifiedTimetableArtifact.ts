import {
  GtfsReconciliationIdentitySchema,
  ScheduledTimetableArtifactMetadataSchema,
} from '@mrtdown/core';
import z from 'zod';
import { compactAssignedTimetable } from './assignedTimetable.js';
import { scheduledTripAssignmentCoverage } from './assignmentCoverage.js';
import { createScheduledTripAssignmentProposals } from './assignmentProposals.js';
import { hashBytes, readVerifiedCapture } from './capture.js';
import { readSchedule, readScheduleFeedRange } from './schedule.js';
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
  mappingApproval?: unknown;
}

/** The caller supplies the exact canonical data tree for the recorded commit. */
export async function prepareVerifiedGtfsTimetableArtifact(
  file: string,
  handoff: string,
  options: VerifiedGtfsTimetableArtifactOptions,
) {
  const { dataDir, canonicalCommit, draft, mappingApproval, ...inputSettings } =
    options;
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
  const feedRange = readScheduleFeedRange(sourceFeedInfo);
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
    mappingApproval,
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
