import { readVerifiedCapture } from './capture.js';
import { auditRealtime } from './realtime.js';
import { auditSchedule, readSchedule } from './schedule.js';

export async function inspectGtfsCapture(file: string, handoff: string) {
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind === 'schedule') {
    const { tables, manifest } = readSchedule(bytes);
    return {
      reportVersion: 1 as const,
      capture,
      manifest,
      schedule: auditSchedule(tables),
    };
  }
  return {
    reportVersion: 1 as const,
    capture,
    realtime: auditRealtime(bytes, capture.feed_kind),
  };
}
