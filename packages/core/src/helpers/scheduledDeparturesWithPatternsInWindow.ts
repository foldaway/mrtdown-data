import type { ScheduledTripPatternDateScope } from '../schema/ScheduledTripPatternDateScope.js';
import type {
  ScheduledDepartureOptions,
  ScheduledTripDateSelection,
} from './scheduledDeparturesInWindow.js';
import {
  collectScheduledDeparturesInWindow,
  departureOccurrences,
} from './scheduledDepartureWindow.js';
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
      | 'serviceMemberships'
      | 'destinationStationId'
    > & { departureInstant: string };

/** Resolve one dated binding per source trip and emit each occurrence once with all service memberships. */
export function scheduledDeparturesWithPatternsInWindow(
  selections: readonly ScheduledTripPatternDateSelection[],
  window: { startInstant: string; endInstant: string },
  options: ScheduledDepartureOptions = {},
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
    return departureOccurrences(resolved.stopTimes, options.boardingOnly).map(
      (stop): ScheduledDepartureWithPattern => ({
        ...stop,
        providerRouteId: resolved.providerRouteId,
        providerCalendarId: resolved.providerCalendarId,
        serviceDate: resolved.serviceDate,
        lineId: resolved.lineId,
        ...(resolved.serviceMemberships
          ? { serviceMemberships: resolved.serviceMemberships }
          : { serviceId: resolved.serviceId, revisionId: resolved.revisionId }),
        destinationStationId: resolved.destinationStationId,
        departureInstant: stop.departureInstant,
      }),
    );
  });
}
