import z from 'zod';
import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import {
  type ScheduledTripPatternDateScope,
  ScheduledTripPatternDateScopeSchema,
} from '../schema/ScheduledTripPatternDateScope.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import {
  bindScheduledTripPattern,
  type ScheduledTripWithPattern,
} from './bindScheduledTripPattern.js';
import { isScheduledServiceDate } from './isScheduledServiceDate.js';
import { scheduledTripTimesOnDate } from './scheduledTripTimesOnDate.js';

/** Resolve supplied date scopes; no mapping choice or approval is inferred. */
export function scheduledTripWithPatternOnDate(
  trip: ScheduledTripTimes,
  calendar: ScheduledServiceCalendar,
  scopesInput: readonly ScheduledTripPatternDateScope[],
  serviceDate: string,
) {
  const dated = scheduledTripTimesOnDate(trip, calendar, serviceDate);
  const scopes = z
    .array(ScheduledTripPatternDateScopeSchema)
    .parse(scopesInput);
  const seenDates = new Set<string>();
  let selected: ScheduledTripWithPattern | undefined;
  for (const scope of scopes) {
    const bound = bindScheduledTripPattern(trip, scope.binding);
    for (const date of scope.serviceDates) {
      if (!isScheduledServiceDate(calendar, date)) {
        throw new Error(
          `Binding date ${date} is inactive for source trip ${trip.providerTripId}`,
        );
      }
      if (seenDates.has(date)) {
        throw new Error(`Overlapping binding service date: ${date}`);
      }
      seenDates.add(date);
    }
    if (scope.serviceDates.includes(serviceDate)) {
      selected = bound;
    }
  }
  if (!dated) {
    return null;
  }
  if (!selected) {
    throw new Error(
      `Active source trip ${trip.providerTripId} has no binding for service date ${serviceDate}`,
    );
  }
  return {
    ...selected,
    serviceDate: dated.serviceDate,
    stopTimes: selected.stopTimes.map((stop, index) => ({
      ...stop,
      arrivalInstant: dated.stopTimes[index].arrivalInstant,
      departureInstant: dated.stopTimes[index].departureInstant,
    })),
  };
}

export type ScheduledTripWithPatternOnDate = NonNullable<
  ReturnType<typeof scheduledTripWithPatternOnDate>
>;
