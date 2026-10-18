import { Temporal } from '@js-temporal/polyfill';
import type { ScheduledTripTimesOnDate } from './scheduledTripTimesOnDate.js';

export type ScheduledDeparture =
  ScheduledTripTimesOnDate['stopTimes'][number] & {
    providerRouteId: string;
    providerCalendarId: string;
    serviceDate: string;
    departureInstant: string;
  };

export interface ScheduledDepartureOptions {
  boardingOnly?: boolean;
}

export function departureOccurrences<
  Stop extends {
    departureInstant: string | null;
    pickupType: number;
    dropOffType: number;
  },
>(stops: readonly Stop[], boardingOnly = false) {
  let lastAlightingIndex = -1;
  if (boardingOnly) {
    for (let index = stops.length - 1; index >= 0; index--) {
      if (stops[index].dropOffType !== 1) {
        lastAlightingIndex = index;
        break;
      }
    }
  }
  return stops.filter(
    (stop, index): stop is Stop & { departureInstant: string } =>
      stop.departureInstant !== null &&
      (!boardingOnly || (stop.pickupType !== 1 && index < lastAlightingIndex)),
  );
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function collectScheduledDeparturesInWindow<
  Selection extends { trip: { providerTripId: string }; serviceDate: string },
  Departure extends ScheduledDeparture,
>(
  selections: readonly Selection[],
  window: { startInstant: string; endInstant: string },
  resolveDepartures: (selection: Selection) => readonly Departure[],
): Departure[] {
  const start = Temporal.Instant.from(window.startInstant);
  const end = Temporal.Instant.from(window.endInstant);
  if (Temporal.Instant.compare(start, end) >= 0) {
    throw new Error('Departure window must end after it starts');
  }
  const departures: Departure[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    const resolved = resolveDepartures(selection);
    const key = JSON.stringify([
      selection.serviceDate,
      selection.trip.providerTripId,
    ]);
    if (seen.has(key)) {
      throw new Error(`Duplicate trip/service-date selection: ${key}`);
    }
    seen.add(key);
    for (const departure of resolved) {
      const instant = Temporal.Instant.from(departure.departureInstant);
      if (
        Temporal.Instant.compare(instant, start) >= 0 &&
        Temporal.Instant.compare(instant, end) < 0
      ) {
        departures.push(departure);
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
