import { scheduledDeparturesInWindow } from '@mrtdown/core';
import z from 'zod';
import { readVerifiedCapture } from './capture.js';
import { compareStrings } from './order.js';
import { readSchedule } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';

export interface GtfsDepartureQuery {
  tripIds?: string[];
  stopIds?: string[];
  serviceDates: string[];
  startInstant: string;
  endInstant: string;
}

export async function inspectGtfsDepartures(
  file: string,
  handoff: string,
  query: GtfsDepartureQuery,
) {
  const tripIds = [...(query.tripIds ?? [])].sort(compareStrings);
  const stopIds = [...(query.stopIds ?? [])].sort(compareStrings);
  const serviceDates = z
    .array(z.iso.date())
    .min(1)
    .parse(query.serviceDates)
    .sort(compareStrings);
  if (!tripIds.length && !stopIds.length) {
    throw new Error('Departure inspection requires trip IDs or stop IDs');
  }
  if (tripIds.length && stopIds.length) {
    throw new Error('Use trip IDs or stop IDs, not both');
  }
  for (const [name, values] of [
    ['trip', tripIds],
    ['stop', stopIds],
    ['service date', serviceDates],
  ] as const) {
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate ${name} selection`);
    }
  }
  const { capture, bytes } = await readVerifiedCapture(file, handoff);
  if (capture.feed_kind !== 'schedule') {
    throw new Error('Departure inspection requires a schedule capture');
  }
  const { tables, manifest } = readSchedule(bytes);
  if (
    tables['agency.txt']?.some(
      (agency) => agency.agency_timezone !== 'Asia/Singapore',
    )
  ) {
    throw new Error(
      'Departure inspection requires Asia/Singapore agency timezones',
    );
  }
  const allTrips = scheduledTripTimesFromGtfs(tables);
  const trips = new Map(allTrips.map((trip) => [trip.providerTripId, trip]));
  const providerStops = new Map(
    (tables['stops.txt'] ?? []).map((stop) => [stop.stop_id, stop]),
  );
  for (const id of stopIds) {
    const stop = providerStops.get(id);
    if (!stop) {
      throw new Error(`Unknown GTFS stop: ${id}`);
    }
    if (stop.location_type && stop.location_type !== '0') {
      throw new Error(`GTFS stop ${id} is not a stop/platform`);
    }
  }
  const stopSet = new Set(stopIds);
  const selectedTrips = tripIds.length
    ? tripIds.map((id) => {
        const trip = trips.get(id);
        if (!trip) {
          throw new Error(`Unknown GTFS trip: ${id}`);
        }
        return trip;
      })
    : allTrips.filter((trip) =>
        trip.stopTimes.some((stop) => stopSet.has(stop.providerStopId)),
      );
  const selectedTripIds = new Set(
    selectedTrips.map((trip) => trip.providerTripId),
  );
  if (
    tables['frequencies.txt']?.some((row) =>
      selectedTripIds.has(row.trip_id ?? ''),
    )
  ) {
    throw new Error(
      'Departure inspection does not support frequency-based trips',
    );
  }
  const selections = selectedTrips.flatMap((trip) => {
    const calendar = scheduledServiceCalendarFromGtfs(
      tables,
      trip.providerCalendarId,
    );
    return serviceDates.map((serviceDate) => ({ trip, calendar, serviceDate }));
  });
  const departures = scheduledDeparturesInWindow(selections, query);
  return {
    reportVersion: 1 as const,
    documentKind: 'gtfs-source-departures' as const,
    capture,
    manifest,
    query: {
      ...(tripIds.length ? { tripIds } : { stopIds }),
      serviceDates,
      startInstant: query.startInstant,
      endInstant: query.endInstant,
    },
    departures: stopIds.length
      ? departures.filter((stop) => stopSet.has(stop.providerStopId))
      : departures,
    generationEligible: false as const,
  };
}
