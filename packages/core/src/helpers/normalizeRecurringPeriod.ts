import { DateTime } from 'luxon';
import {
  DateTime as DateTimeRust,
  Frequency,
  type NWeekday,
  RRule,
  RRuleSet,
  Weekday,
} from 'rrule-rust';
import type {
  PeriodFixed,
  PeriodFrequency,
  PeriodRecurring,
} from '../schema/issue/period.js';
import { assert } from '../util/assert.js';

function toFrequency(frequency: PeriodFrequency): Frequency {
  switch (frequency) {
    case 'daily':
      return Frequency.Daily;
    case 'weekly':
      return Frequency.Weekly;
    case 'monthly':
      return Frequency.Monthly;
    case 'yearly':
      return Frequency.Yearly;
    default:
      throw new Error(`Invalid frequency: ${frequency}`);
  }
}

function toDaysOfWeek(
  daysOfWeek: PeriodRecurring['daysOfWeek'],
): readonly (NWeekday | Weekday)[] {
  const result: (NWeekday | Weekday)[] = [];

  for (const day of daysOfWeek ?? []) {
    switch (day) {
      case 'MO':
        result.push(Weekday.Monday);
        break;
      case 'TU':
        result.push(Weekday.Tuesday);
        break;
      case 'WE':
        result.push(Weekday.Wednesday);
        break;
      case 'TH':
        result.push(Weekday.Thursday);
        break;
      case 'FR':
        result.push(Weekday.Friday);
        break;
      case 'SA':
        result.push(Weekday.Saturday);
        break;
      case 'SU':
        result.push(Weekday.Sunday);
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

  const rruleSet = new RRuleSet({
    dtstart: DateTimeRust.fromObject(startAt.toObject()),
    tzid: period.timeZone,
    rrules: [
      new RRule({
        until: DateTimeRust.fromObject(endAt.toObject()),
        frequency: toFrequency(period.frequency),
        interval: 1,
        byWeekday: toDaysOfWeek(period.daysOfWeek),
        byHour: byTimes.byHour,
        byMinute: byTimes.byMinute,
        bySecond: byTimes.bySecond,
      }),
    ],
    exdates: period.excludedDates?.map((date) => {
      const dateTime = DateTime.fromISO(date).setZone(period.timeZone, {
        keepLocalTime: true,
      });
      assert(dateTime.isValid, `Invalid ISO datetime: ${date}`);
      return DateTimeRust.fromObject(dateTime.toObject());
    }),
  });

  const timeWindowEndAt = DateTime.fromISO(period.timeWindow.endAt);
  assert(
    timeWindowEndAt.isValid,
    `Invalid ISO datetime: ${period.timeWindow.endAt}`,
  );

  for (const dt of rruleSet.all()) {
    const dtStart = DateTime.fromObject(dt.toObject()).setZone(rruleSet.tzid, {
      keepLocalTime: true,
    });
    assert(dtStart.isValid);
    const dtEnd = DateTime.fromObject({
      ...dt.toObject(),
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
