import { ScheduledTripTimesSchema } from '@mrtdown/core';
import { compareStopSequences, compareStrings } from './order.js';
import { auditSchedule, type ScheduleTables } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';
import { scheduledStopTimeFromGtfs } from './scheduledStopTime.js';

/** Assemble every fixed-stop source trip's timing; no mapping or publication. */
export function scheduledTripTimesFromGtfs(tables: ScheduleTables) {
  const { structuralErrors } = auditSchedule(tables);
  if (structuralErrors.length)
    throw new Error(`Invalid GTFS schedule: ${structuralErrors.join('; ')}`);
  const trips = [...(tables['trips.txt'] ?? [])].sort((a, b) =>
    compareStrings(a.trip_id ?? '', b.trip_id ?? ''),
  );
  for (const calendar of new Set(trips.map((trip) => trip.service_id ?? '')))
    scheduledServiceCalendarFromGtfs(tables, calendar);

  const stops = new Map(
    (tables['stops.txt'] ?? []).map((stop) => [stop.stop_id, stop]),
  );
  const occurrences = new Map<string, Record<string, string>[]>();
  for (const row of tables['stop_times.txt'] ?? []) {
    const stop = stops.get(row.stop_id);
    if (stop?.location_type && stop.location_type !== '0')
      throw new Error(
        `GTFS trip ${row.trip_id}: stop ${row.stop_id} is not a stop/platform`,
      );
    const tripId = row.trip_id ?? '';
    const rows = occurrences.get(tripId) ?? [];
    rows.push(row);
    occurrences.set(tripId, rows);
  }
  return trips.map((trip) => {
    try {
      return ScheduledTripTimesSchema.parse({
        providerTripId: trip.trip_id,
        providerRouteId: trip.route_id,
        providerCalendarId: trip.service_id,
        stopTimes: (occurrences.get(trip.trip_id ?? '') ?? [])
          .sort((a, b) =>
            compareStopSequences(a.stop_sequence ?? '', b.stop_sequence ?? ''),
          )
          .map(scheduledStopTimeFromGtfs),
      });
    } catch (cause) {
      throw new Error(
        `Invalid GTFS trip timing ${trip.trip_id}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  });
}
