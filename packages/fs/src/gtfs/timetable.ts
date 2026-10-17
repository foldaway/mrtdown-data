import { hashBytes, readVerifiedCapture } from './capture.js';
import { readSchedule } from './schedule.js';
import { scheduledTimetableFromGtfs } from './scheduledTimetable.js';

export async function inspectGtfsTimetable(file: string, handoff: string) {
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
