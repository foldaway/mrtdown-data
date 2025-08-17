import { type DateTime, Duration, Interval } from 'luxon';
import { assert } from '../util/assert.js';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours.js';

export function calculateDurationWithinServiceHours(
  start: DateTime,
  end: DateTime,
): Duration {
  const interval = Interval.fromDateTimes(start, end);
  assert(interval.isValid);

  let result = Duration.fromObject({ seconds: 0 });

  for (const segment of splitIntervalByServiceHours(interval)) {
    result = result.plus(segment.toDuration());
  }

  return result;
}
