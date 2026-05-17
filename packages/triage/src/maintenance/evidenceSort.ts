import { DateTime } from 'luxon';
import { assert } from '../util/assert.js';

export interface TimestampedEvidence {
  ts: string;
}

export function compareEvidenceByInstant(
  left: TimestampedEvidence,
  right: TimestampedEvidence,
): number {
  const leftMillis = timestampMillis(left.ts);
  const rightMillis = timestampMillis(right.ts);

  return leftMillis - rightMillis || left.ts.localeCompare(right.ts);
}

function timestampMillis(ts: string): number {
  const timestamp = DateTime.fromISO(ts, { setZone: true });
  assert(timestamp.isValid, `Invalid evidence timestamp: ${ts}`);
  return timestamp.toMillis();
}
