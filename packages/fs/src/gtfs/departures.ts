import { scheduledDeparturesInWindow } from '@mrtdown/core';
import { readVerifiedCapture } from './capture.js';
import { compareStrings } from './order.js';
import { readSchedule } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';

export interface GtfsDepartureQuery {
  tripIds: string[];
  serviceDates: string[];
  startInstant: string;
  endInstant: string;
}

export async function inspectGtfsDepartures(
  file: string,
  handoff: string,
  query: GtfsDepartureQuery,
) {
  if (!query.tripIds.length || !query.serviceDates.length) {
    throw new Error('Departure inspection requires trips and service dates');
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
  if (
    tables['frequencies.txt']?.some((row) =>
      query.tripIds.includes(row.trip_id ?? ''),
    )
  ) {
    throw new Error(
      'Departure inspection does not support frequency-based trips',
    );
  }
  const trips = new Map(
    scheduledTripTimesFromGtfs(tables).map((trip) => [
      trip.providerTripId,
      trip,
    ]),
  );
  const tripIds = [...query.tripIds].sort(compareStrings);
  const serviceDates = [...query.serviceDates].sort(compareStrings);
  const selections = tripIds.flatMap((id) => {
    const trip = trips.get(id);
    if (!trip) {
      throw new Error(`Unknown GTFS trip: ${id}`);
    }
    const calendar = scheduledServiceCalendarFromGtfs(
      tables,
      trip.providerCalendarId,
    );
    return serviceDates.map((serviceDate) => ({ trip, calendar, serviceDate }));
  });
  return {
    reportVersion: 1 as const,
    documentKind: 'gtfs-source-departures' as const,
    capture,
    manifest,
    query: {
      tripIds,
      serviceDates,
      startInstant: query.startInstant,
      endInstant: query.endInstant,
    },
    departures: scheduledDeparturesInWindow(selections, query),
    generationEligible: false as const,
  };
}
