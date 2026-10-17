import { Temporal } from '@js-temporal/polyfill';
import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import {
  type ScheduledTripTimesOnDate,
  scheduledTripTimesOnDate,
} from './scheduledTripTimesOnDate.js';

export interface ScheduledTripDateSelection {
  trip: ScheduledTripTimes;
  calendar: ScheduledServiceCalendar;
  serviceDate: string;
}

export type ScheduledDeparture =
  ScheduledTripTimesOnDate['stopTimes'][number] & {
    providerRouteId: string;
    providerCalendarId: string;
    serviceDate: string;
    departureInstant: string;
  };

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Callers select source snapshots and service dates before querying their events. */
export function scheduledDeparturesInWindow(
  selections: readonly ScheduledTripDateSelection[],
  window: { startInstant: string; endInstant: string },
): ScheduledDeparture[] {
  const start = Temporal.Instant.from(window.startInstant);
  const end = Temporal.Instant.from(window.endInstant);
  if (Temporal.Instant.compare(start, end) >= 0) {
    throw new Error('Departure window must end after it starts');
  }

  const departures: ScheduledDeparture[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    const resolved = scheduledTripTimesOnDate(
      selection.trip,
      selection.calendar,
      selection.serviceDate,
    );
    const key = JSON.stringify([
      selection.serviceDate,
      selection.trip.providerTripId,
    ]);
    if (seen.has(key)) {
      throw new Error(`Duplicate trip/service-date selection: ${key}`);
    }
    seen.add(key);
    if (!resolved) {
      continue;
    }
    for (const stop of resolved.stopTimes) {
      if (stop.departureInstant === null) {
        continue;
      }
      const instant = Temporal.Instant.from(stop.departureInstant);
      if (
        Temporal.Instant.compare(instant, start) >= 0 &&
        Temporal.Instant.compare(instant, end) < 0
      ) {
        departures.push({
          ...stop,
          providerRouteId: resolved.providerRouteId,
          providerCalendarId: resolved.providerCalendarId,
          serviceDate: resolved.serviceDate,
          departureInstant: stop.departureInstant,
        });
      }
    }
  }
  // Unique trip/date selections let stable sorting retain validated occurrence order.
  return departures.sort(
    (left, right) =>
      Temporal.Instant.compare(left.departureInstant, right.departureInstant) ||
      compareText(left.serviceDate, right.serviceDate) ||
      compareText(left.providerTripId, right.providerTripId),
  );
}
