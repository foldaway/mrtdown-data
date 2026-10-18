import type { ScheduledTripPatternDateScope } from '../schema/ScheduledTripPatternDateScope.js';
import type { ScheduledTripDateSelection } from './scheduledDeparturesInWindow.js';
import { collectScheduledDeparturesInWindow } from './scheduledDepartureWindow.js';
import {
  type ScheduledTripWithPatternOnDate,
  scheduledTripWithPatternOnDate,
} from './scheduledTripWithPatternOnDate.js';

export interface ScheduledTripPatternDateSelection
  extends ScheduledTripDateSelection {
  scopes: readonly ScheduledTripPatternDateScope[];
}

export type ScheduledDepartureWithPattern =
  ScheduledTripWithPatternOnDate['stopTimes'][number] &
    Pick<
      ScheduledTripWithPatternOnDate,
      | 'providerRouteId'
      | 'providerCalendarId'
      | 'serviceDate'
      | 'lineId'
      | 'serviceId'
      | 'revisionId'
      | 'destinationStationId'
    > & { departureInstant: string };

export function scheduledDeparturesWithPatternsInWindow(
  selections: readonly ScheduledTripPatternDateSelection[],
  window: { startInstant: string; endInstant: string },
): ScheduledDepartureWithPattern[] {
  return collectScheduledDeparturesInWindow(selections, window, (selection) => {
    const resolved = scheduledTripWithPatternOnDate(
      selection.trip,
      selection.calendar,
      selection.scopes,
      selection.serviceDate,
    );
    if (!resolved) {
      return [];
    }
    return resolved.stopTimes.flatMap(
      (stop): ScheduledDepartureWithPattern[] => {
        if (stop.departureInstant === null) {
          return [];
        }
        return [
          {
            ...stop,
            providerRouteId: resolved.providerRouteId,
            providerCalendarId: resolved.providerCalendarId,
            serviceDate: resolved.serviceDate,
            lineId: resolved.lineId,
            serviceId: resolved.serviceId,
            revisionId: resolved.revisionId,
            destinationStationId: resolved.destinationStationId,
            departureInstant: stop.departureInstant,
          },
        ];
      },
    );
  });
}
