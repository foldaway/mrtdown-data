import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import {
  collectScheduledDeparturesInWindow,
  type ScheduledDeparture,
} from './scheduledDepartureWindow.js';
import { scheduledTripTimesOnDate } from './scheduledTripTimesOnDate.js';

export type { ScheduledDeparture } from './scheduledDepartureWindow.js';

export interface ScheduledTripDateSelection {
  trip: ScheduledTripTimes;
  calendar: ScheduledServiceCalendar;
  serviceDate: string;
}

/** Callers select source snapshots and service dates before querying their events. */
export function scheduledDeparturesInWindow(
  selections: readonly ScheduledTripDateSelection[],
  window: { startInstant: string; endInstant: string },
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
    return resolved.stopTimes.flatMap((stop): ScheduledDeparture[] => {
      if (stop.departureInstant === null) {
        return [];
      }
      return [
        {
          ...stop,
          providerRouteId: resolved.providerRouteId,
          providerCalendarId: resolved.providerCalendarId,
          serviceDate: resolved.serviceDate,
          departureInstant: stop.departureInstant,
        },
      ];
    });
  });
}
