import z from 'zod';
import { scheduledTripAssignmentCoverage } from './assignmentCoverage.js';
import { hashBytes, readVerifiedCapture } from './capture.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import { readSchedule } from './schedule.js';
import {
  ScheduledTripPatternAssignmentSchema,
  validateScheduledTripPatternAssignments,
} from './scheduledTripAssignment.js';
import { readScheduleTopology } from './topology.js';

export const ScheduledTripAssignmentDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-trip-assignments'),
    identity: ReconciliationIdentitySchema,
    assignments: z.array(ScheduledTripPatternAssignmentSchema),
  })
  .strict();

export type ScheduledTripAssignmentDocument = z.infer<
  typeof ScheduledTripAssignmentDocumentSchema
>;

/** The caller supplies the exact canonical data tree and its recorded commit. */
export async function inspectGtfsTripAssignments(
  file: string,
  handoff: string,
  options: {
    dataDir: string;
    canonicalCommit: string;
    assignments: unknown;
    coverage?: boolean;
  },
) {
  const document = ScheduledTripAssignmentDocumentSchema.parse(
    options.assignments,
  );
  const canonicalCommit =
    ReconciliationIdentitySchema.shape.canonicalCommit.parse(
      options.canonicalCommit,
    );
  if (document.identity.canonicalCommit !== canonicalCommit) {
    throw new Error(
      'Assignments canonical commit does not match the supplied canonical commit',
    );
  }
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind !== 'schedule') {
    throw new Error('Assignment validation requires a schedule capture');
  }
  const { tables, manifest } = readSchedule(bytes);
  const expected = Object.entries(document.identity.sourceManifest);
  if (
    expected.length !== Object.keys(manifest).length ||
    expected.some(([name, hash]) => manifest[name] !== hash)
  ) {
    throw new Error('Assignments source manifest does not match the capture');
  }
  const topology = await readScheduleTopology(options.dataDir);
  const topologyHash = hashBytes(Buffer.from(JSON.stringify(topology)));
  if (document.identity.topology.sha256 !== topologyHash) {
    throw new Error(
      'Assignments topology fingerprint does not match the supplied canonical data',
    );
  }
  const assignments = validateScheduledTripPatternAssignments(
    tables,
    document.assignments,
    topology,
  );
  return {
    reportVersion: 1 as const,
    documentKind: 'gtfs-trip-assignment-validation' as const,
    capture,
    identity: {
      sourceManifest: manifest,
      canonicalCommit,
      topology: {
        projectionVersion: topology.projectionVersion,
        sha256: topologyHash,
      },
    },
    assignmentsSha256: hashBytes(Buffer.from(JSON.stringify(assignments))),
    assignmentCount: assignments.length,
    tripCount: new Set(
      assignments.map(({ scope }) => scope.binding.providerTripId),
    ).size,
    tripDateCount: assignments.reduce(
      (count, { scope }) => count + scope.serviceDates.length,
      0,
    ),
    generationEligible: false as const,
    ...(options.coverage
      ? { coverage: scheduledTripAssignmentCoverage(tables, assignments) }
      : {}),
  };
}
