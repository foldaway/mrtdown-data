import {
  isScheduledServiceDate,
  type ScheduledServiceCalendar,
} from '@mrtdown/core';
import { hashBytes } from './capture.js';
import {
  validateScheduledTripPatternBoarding,
  validateScheduledTripPatternDateScope,
  validateScheduledTripPatternReferences,
} from './scheduledTripPattern.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';
import { readScheduleTopology } from './topology.js';

function activeDates(calendar: ScheduledServiceCalendar) {
  const dates = new Set<string>();
  if (calendar.weekly) {
    const start = Date.parse(`${calendar.weekly.startDate}T00:00:00Z`);
    const end = Date.parse(`${calendar.weekly.endDate}T00:00:00Z`);
    const day = 86_400_000;
    if ((end - start) / day > 36600) {
      throw new Error('Calendar exceeds 100-year timetable import limit');
    }
    for (let instant = start; instant <= end; instant += day) {
      const date = new Date(instant).toISOString().slice(0, 10);
      if (isScheduledServiceDate(calendar, date)) {
        dates.add(date);
      }
    }
  }
  for (const { date, available } of calendar.exceptions) {
    if (available) {
      dates.add(date);
    } else {
      dates.delete(date);
    }
  }
  return [...dates].sort();
}

/** The canonical data tree must remain stable while this read-only check runs. */
export async function verifyScheduledTimetableForCanonicalData(
  manifestBytes: Uint8Array,
  expectedManifestSha256: string,
  files: { timetableBytes: Uint8Array; noticeBytes: Uint8Array },
  options: { dataDir: string },
) {
  const verified = verifyScheduledTimetableArtifact(
    manifestBytes,
    expectedManifestSha256,
    files,
  );
  const projection = await readScheduleTopology(options.dataDir);
  const topology = {
    projectionVersion: projection.projectionVersion,
    sha256: hashBytes(Buffer.from(JSON.stringify(projection))),
  };
  if (
    verified.manifest.identity.topology.projectionVersion !==
      topology.projectionVersion ||
    verified.manifest.identity.topology.sha256 !== topology.sha256
  ) {
    throw new Error(
      'Timetable topology fingerprint does not match the installed canonical data',
    );
  }
  const { timetable: source, patterns, assignments } = verified.timetable;
  const byPattern = new Map(patterns.map(({ id, pattern }) => [id, pattern]));
  const byTrip = new Map(
    source.trips.map((trip) => [trip.providerTripId, trip]),
  );
  const byCalendar = new Map(
    source.calendars.map((calendar) => [
      calendar.providerCalendarId,
      activeDates(calendar),
    ]),
  );
  for (const { pattern } of patterns) {
    validateScheduledTripPatternReferences(pattern, projection);
  }
  for (const assignment of assignments) {
    const trip = byTrip.get(assignment.providerTripId);
    const pattern = byPattern.get(assignment.patternId);
    if (!trip || !pattern) {
      throw new Error('Missing validated timetable assignment reference');
    }
    const dates = byCalendar.get(trip.providerCalendarId);
    if (!dates) {
      throw new Error(
        `Missing validated source calendar: ${trip.providerCalendarId}`,
      );
    }
    const serviceDates: string[] = [];
    for (const range of assignment.dateRanges) {
      if (
        range.startDate < verified.manifest.feedRange.startDate ||
        range.endDate > verified.manifest.feedRange.endDate
      ) {
        throw new Error(
          `Trip ${trip.providerTripId}: assignment range is outside the declared feed range`,
        );
      }
      const active = dates.filter(
        (date) => date >= range.startDate && date <= range.endDate,
      );
      if (active[0] !== range.startDate || active.at(-1) !== range.endDate) {
        throw new Error(
          `Trip ${trip.providerTripId}: assignment range endpoints must be active source dates`,
        );
      }
      serviceDates.push(...active);
    }
    const binding = {
      providerTripId: trip.providerTripId,
      occurrences: trip.stopTimes.map(({ providerStopId, stopSequence }) => ({
        providerStopId,
        stopSequence,
      })),
      pattern,
    };
    validateScheduledTripPatternDateScope(
      { binding, serviceDates },
      projection,
    );
    validateScheduledTripPatternBoarding(trip, binding, projection);
  }
  return { ...verified, topology };
}
