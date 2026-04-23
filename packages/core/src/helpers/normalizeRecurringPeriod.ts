import { Temporal } from '@js-temporal/polyfill';
import { DateTime } from 'luxon';
import { type Freq, RRuleTemporal } from 'rrule-temporal';
import type {
  PeriodFixed,
  PeriodFrequency,
  PeriodRecurring,
} from '../schema/issue/period.js';
import { assert } from '../util/assert.js';

function toFrequency(frequency: PeriodFrequency): Freq {
  switch (frequency) {
    case 'daily':
      return 'DAILY';
    case 'weekly':
      return 'WEEKLY';
    case 'monthly':
      return 'MONTHLY';
    case 'yearly':
      return 'YEARLY';
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
}

function toDaysOfWeek(daysOfWeek: PeriodRecurring['daysOfWeek']): string[] {
  const result: string[] = [];

  for (const day of daysOfWeek ?? []) {
    switch (day) {
      case 'MO':
        result.push('MO');
        break;
      case 'TU':
        result.push('TU');
        break;
      case 'WE':
        result.push('WE');
        break;
      case 'TH':
        result.push('TH');
        break;
      case 'FR':
        result.push('FR');
        break;
      case 'SA':
        result.push('SA');
        break;
      case 'SU':
        result.push('SU');
        break;
      default:
        throw new Error(`Invalid day of week: ${day}`);
    }
  }

  return result;
}

function toByTimes(timeWindow: PeriodRecurring['timeWindow']): {
  byHour: number[];
  byMinute: number[];
  bySecond: number[];
} {
  const startAtTime = DateTime.fromISO(timeWindow.startAt);
  assert(startAtTime.isValid, `Invalid ISO datetime: ${timeWindow.startAt}`);

  return {
    byHour: [startAtTime.hour],
    byMinute: [startAtTime.minute],
    bySecond: [startAtTime.second],
  };
}

/**
 * Normalize a recurring period into a list of fixed periods.
 * @param period - The recurring period to normalize.
 * @returns The list of fixed periods.
 */
export function normalizeRecurringPeriod(
  period: PeriodRecurring,
): PeriodFixed[] {
  const fixedPeriods: PeriodFixed[] = [];

  const startAt = DateTime.fromISO(period.startAt).setZone(period.timeZone, {
    keepLocalTime: true,
  });
  assert(startAt.isValid, `Invalid ISO datetime: ${period.startAt}`);
  const endAt = DateTime.fromISO(period.endAt).setZone(period.timeZone, {
    keepLocalTime: true,
  });
  assert(endAt.isValid, `Invalid ISO datetime: ${period.endAt}`);

  const byTimes = toByTimes(period.timeWindow);

  const rruleSet = new RRuleTemporal({
    dtstart: Temporal.ZonedDateTime.from({
      ...startAt.toObject(),
      timeZone: startAt.zoneName,
    }),
    until: Temporal.ZonedDateTime.from({
      ...endAt.toObject(),
      timeZone: endAt.zoneName,
    }),
    freq: toFrequency(period.frequency),
    interval: 1,
    byDay: toDaysOfWeek(period.daysOfWeek),
    byHour: byTimes.byHour,
    byMinute: byTimes.byMinute,
    bySecond: byTimes.bySecond,
    exDate: period.excludedDates?.map((date) => {
      const dateTime = DateTime.fromISO(date).setZone(period.timeZone, {
        keepLocalTime: true,
      });
      assert(dateTime.isValid, `Invalid ISO datetime: ${date}`);
      return Temporal.ZonedDateTime.from({
        ...dateTime.toObject(),
        timeZone: dateTime.zoneName,
      });
    }),
  });

  const timeWindowEndAt = DateTime.fromISO(period.timeWindow.endAt);
  assert(
    timeWindowEndAt.isValid,
    `Invalid ISO datetime: ${period.timeWindow.endAt}`,
  );

  for (const dt of rruleSet.all()) {
    const dtStart = DateTime.fromObject({
      day: dt.day,
      month: dt.month,
      year: dt.year,
      hour: dt.hour,
      minute: dt.minute,
      second: dt.second,
    }).setZone(dt.timeZoneId, {
      keepLocalTime: true,
    });
    assert(dtStart.isValid);
    const dtEnd = DateTime.fromObject({
      day: dt.day,
      month: dt.month,
      year: dt.year,
      hour: timeWindowEndAt.toObject().hour,
      minute: timeWindowEndAt.toObject().minute,
      second: timeWindowEndAt.toObject().second,
    });
    assert(dtEnd.isValid);
    fixedPeriods.push({
      kind: 'fixed',
      startAt: dtStart.toISO(),
      endAt: dtEnd.toISO(),
    });
  }

  return fixedPeriods;
}
