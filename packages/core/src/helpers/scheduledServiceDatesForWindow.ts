import { Temporal } from '@js-temporal/polyfill';
import {
  type ScheduledServiceCalendar,
  ScheduledServiceCalendarSchema,
} from '../schema/ScheduledServiceCalendar.js';
import { ScheduledServiceDaySecondsSchema } from '../schema/ScheduledStopTime.js';
import { isScheduledServiceDate } from './isScheduledServiceDate.js';
import { scheduledServiceDayInstant } from './scheduledServiceDayInstant.js';

/** Candidate dates still require filtering against actual trip departure offsets. */
export function scheduledServiceDatesForWindow(
  input: ScheduledServiceCalendar,
  window: { startInstant: string; endInstant: string },
  maximumOffsetSeconds: number,
): string[] {
  const calendar = ScheduledServiceCalendarSchema.parse(input);
  const maximum = ScheduledServiceDaySecondsSchema.parse(maximumOffsetSeconds);
  const start = Temporal.Instant.from(window.startInstant);
  const end = Temporal.Instant.from(window.endInstant);
  if (Temporal.Instant.compare(start, end) >= 0) {
    throw new Error('Departure window must end after it starts');
  }
  const bounds = calendar.exceptions
    .filter((exception) => exception.available)
    .map((exception) => exception.date);
  if (calendar.weekly) {
    bounds.push(calendar.weekly.startDate, calendar.weekly.endDate);
  }
  bounds.sort();
  const lower = bounds[0];
  const upper = bounds.at(-1);
  if (!lower || !upper) {
    return [];
  }

  // GTFS service-day zero is local noon minus twelve elapsed hours.
  let first = start
    .subtract({ seconds: maximum })
    .add({ hours: 12 })
    .toZonedDateTimeISO('Asia/Singapore')
    .toPlainDate();
  let last = end
    .add({ hours: 12 })
    .toZonedDateTimeISO('Asia/Singapore')
    .toPlainDate();
  if (Temporal.PlainDate.compare(first, lower) < 0) {
    first = Temporal.PlainDate.from(lower);
  }
  if (Temporal.PlainDate.compare(last, upper) > 0) {
    last = Temporal.PlainDate.from(upper);
  }
  const dates: string[] = [];
  for (
    let date = first;
    Temporal.PlainDate.compare(date, last) <= 0;
    date = date.add({ days: 1 })
  ) {
    const serviceDate = date.toString();
    if (!isScheduledServiceDate(calendar, serviceDate)) {
      continue;
    }
    const base = Temporal.Instant.from(
      scheduledServiceDayInstant(serviceDate, 0),
    );
    if (
      Temporal.Instant.compare(base, end) < 0 &&
      Temporal.Instant.compare(base.add({ seconds: maximum }), start) >= 0
    ) {
      dates.push(serviceDate);
    }
  }
  return dates;
}
