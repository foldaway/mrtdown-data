import { compactAssignedTimetable } from './assignedTimetable.js';
import { scheduledTripAssignmentCoverage } from './assignmentCoverage.js';
import {
  readVerifiedTripAssignments,
  type ScheduledTripAssignmentInputOptions,
} from './assignmentInput.js';
import { hashBytes, readVerifiedCapture } from './capture.js';
import { readSchedule } from './schedule.js';
import { scheduledTimetableFromGtfs } from './scheduledTimetable.js';

async function inspectTimetable(
  file: string,
  handoff: string,
  options?: ScheduledTripAssignmentInputOptions,
) {
  if (options) {
    const { capture, tables, document } = await readVerifiedTripAssignments(
      file,
      handoff,
      options,
    );
    const timetable = compactAssignedTimetable(tables, document.assignments);
    return {
      reportVersion: 1 as const,
      documentKind: 'gtfs-assigned-timetable' as const,
      capture,
      identity: document.identity,
      assignmentsSha256: hashBytes(
        Buffer.from(JSON.stringify(document.assignments)),
      ),
      timetableSha256: hashBytes(Buffer.from(JSON.stringify(timetable))),
      timetable,
      coverage: scheduledTripAssignmentCoverage(tables, document.assignments),
      generationEligible: false as const,
    };
  }
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind !== 'schedule') {
    throw new Error('Timetable inspection requires a schedule capture');
  }
  const { tables, manifest } = readSchedule(bytes);
  const timetable = scheduledTimetableFromGtfs(tables);
  return {
    reportVersion: 1 as const,
    documentKind: 'gtfs-source-timetable' as const,
    capture,
    manifest,
    timetableSha256: hashBytes(Buffer.from(JSON.stringify(timetable))),
    timetable,
    generationEligible: false as const,
  };
}

type TimetableReport = Awaited<ReturnType<typeof inspectTimetable>>;
export function inspectGtfsTimetable(
  file: string,
  handoff: string,
  options?: undefined,
): Promise<Extract<TimetableReport, { documentKind: 'gtfs-source-timetable' }>>;
export function inspectGtfsTimetable(
  file: string,
  handoff: string,
  options: ScheduledTripAssignmentInputOptions,
): Promise<
  Extract<TimetableReport, { documentKind: 'gtfs-assigned-timetable' }>
>;
export function inspectGtfsTimetable(
  file: string,
  handoff: string,
  options?: ScheduledTripAssignmentInputOptions,
): Promise<TimetableReport>;
export function inspectGtfsTimetable(
  file: string,
  handoff: string,
  options?: ScheduledTripAssignmentInputOptions,
) {
  return inspectTimetable(file, handoff, options);
}
