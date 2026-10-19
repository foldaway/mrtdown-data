import { scheduledTripAssignmentCoverage } from './assignmentCoverage.js';
import {
  readVerifiedTripAssignments,
  type ScheduledTripAssignmentInputOptions,
} from './assignmentInput.js';
import { hashBytes } from './capture.js';

export {
  type ScheduledTripAssignmentDocument,
  ScheduledTripAssignmentDocumentSchema,
} from './assignmentInput.js';

/** The caller supplies the exact canonical data tree and its recorded commit. */
export async function inspectGtfsTripAssignments(
  file: string,
  handoff: string,
  options: ScheduledTripAssignmentInputOptions & { coverage?: boolean },
) {
  const { capture, tables, document } = await readVerifiedTripAssignments(
    file,
    handoff,
    options,
  );
  const assignments = document.assignments;
  return {
    reportVersion: 1 as const,
    documentKind: 'gtfs-trip-assignment-validation' as const,
    capture,
    identity: document.identity,
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
