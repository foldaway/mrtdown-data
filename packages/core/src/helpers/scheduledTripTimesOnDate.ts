import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import {
  type ScheduledTripTimes,
  ScheduledTripTimesSchema,
} from '../schema/ScheduledTripTimes.js';
import { isScheduledServiceDate } from './isScheduledServiceDate.js';
import { scheduledServiceDayInstant } from './scheduledServiceDayInstant.js';

/** Resolve source-trip events on one enabled service date, without canonical allocation. */
export function scheduledTripTimesOnDate(
  input: ScheduledTripTimes,
  calendar: ScheduledServiceCalendar,
  serviceDate: string,
) {
  const trip = ScheduledTripTimesSchema.parse(input);
  const available = isScheduledServiceDate(calendar, serviceDate);
  if (trip.providerCalendarId !== calendar.providerCalendarId)
    throw new Error(
      `Trip ${trip.providerTripId} requires calendar ${trip.providerCalendarId}, not ${calendar.providerCalendarId}`,
    );
  if (!available) return null;
  const instant = (seconds: number | null) =>
    seconds === null ? null : scheduledServiceDayInstant(serviceDate, seconds);
  return {
    ...trip,
    serviceDate,
    stopTimes: trip.stopTimes.map((stop) => ({
      ...stop,
      arrivalInstant: instant(stop.arrivalSeconds),
      departureInstant: instant(stop.departureSeconds),
    })),
  };
}

export type ScheduledTripTimesOnDate = NonNullable<
  ReturnType<typeof scheduledTripTimesOnDate>
>;
