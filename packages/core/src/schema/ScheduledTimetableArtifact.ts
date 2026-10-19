import z from 'zod';
import {
  GtfsCaptureSchema,
  GtfsReconciliationIdentitySchema,
} from './GtfsProvenance.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const fileIdentity = z
  .object({ sha256: digest, byteLength: z.number().int().positive() })
  .strict();
const feedRange = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date() })
  .strict()
  .refine((value) => value.startDate <= value.endDate, {
    path: ['endDate'],
    message: 'Feed range end cannot precede its start',
  });

const metadata = {
  schemaVersion: z.literal(1),
  documentKind: z.literal('scheduled-timetable-artifact'),
  correctionRevision: z.number().int().positive(),
  capture: GtfsCaptureSchema.extend({
    feed_kind: z.literal('schedule'),
    source: z.literal(
      'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
    ),
  }),
  identity: GtfsReconciliationIdentitySchema,
  mapping: z
    .object({
      version: z.string().min(1),
      draftSha256: digest,
      assignmentsSha256: digest,
    })
    .strict(),
  feedRange,
  // Retain provider fields verbatim; a version string alone does not establish ordering.
  sourceFeedInfo: z.array(z.record(z.string(), z.string())),
  currentLicenceReference: z.url(),
  mrtdownLicence: z.literal('CC-BY-4.0'),
};

export const ScheduledTimetableArtifactMetadataSchema = z
  .object(metadata)
  .strict();
export type ScheduledTimetableArtifactMetadata = z.infer<
  typeof ScheduledTimetableArtifactMetadataSchema
>;

/** A storage contract; hashes and revision numbers do not approve publication or lineage. */
export const ScheduledTimetableArtifactManifestSchema = z
  .object({
    ...metadata,
    timetable: fileIdentity,
    notice: fileIdentity,
  })
  .strict();
export type ScheduledTimetableArtifactManifest = z.infer<
  typeof ScheduledTimetableArtifactManifestSchema
>;
