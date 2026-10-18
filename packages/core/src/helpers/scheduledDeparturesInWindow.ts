import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import {
  collectScheduledDeparturesInWindow,
  departureOccurrences,
  type ScheduledDeparture,
  type ScheduledDepartureOptions,
} from './scheduledDepartureWindow.js';
import { scheduledTripTimesOnDate } from './scheduledTripTimesOnDate.js';

export type {
  ScheduledDeparture,
  ScheduledDepartureOptions,
} from './scheduledDepartureWindow.js';

export interface ScheduledTripDateSelection {
  trip: ScheduledTripTimes;
  calendar: ScheduledServiceCalendar;
  serviceDate: string;
}

/** Callers select source snapshots and service dates before querying their events. */
export function scheduledDeparturesInWindow(
  selections: readonly ScheduledTripDateSelection[],
  window: { startInstant: string; endInstant: string },
  options: ScheduledDepartureOptions = {},
): ScheduledDeparture[] {
  return collectScheduledDeparturesInWindow(selections, window, (selection) => {
    const resolved = scheduledTripTimesOnDate(
      selection.trip,
      selection.calendar,
      selection.serviceDate,
    );
    if (!resolved) {
      return [];
    }
    return departureOccurrences(resolved.stopTimes, options.boardingOnly).map(
      (stop): ScheduledDeparture => ({
        ...stop,
        providerRouteId: resolved.providerRouteId,
        providerCalendarId: resolved.providerCalendarId,
        serviceDate: resolved.serviceDate,
        departureInstant: stop.departureInstant,
      }),
    );
  });
}
