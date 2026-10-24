import {
  isScheduledServiceDate,
  type ScheduledDepartureWithPattern,
  type ScheduledTripPatternDateSelection,
  scheduledDeparturesWithPatternsInWindow,
  scheduledServiceDatesForWindow,
} from '@mrtdown/core';
import { DateTime } from 'luxon';
import z from 'zod';
import { compareStrings } from './order.js';
import {
  type ScheduledTimetableRequestScope,
  ScheduledTimetableRequestScopeSchema,
  selectFromRetainedTimetableHistory,
  type selectRetainedScheduledTimetable,
} from './timetableSelection.js';
import {
  readRetainedScheduledTimetable,
  readScheduledTimetableHistory,
} from './timetableStore.js';
import { buildScheduleTopologyFingerprint } from './topology.js';

export type RetainedScheduledDeparture = ScheduledDepartureWithPattern & {
  basis: 'scheduled';
  precision: 'exact' | 'approximate';
  manifestSha256: string;
  snapshotSha256: string;
  retrievedAt: string;
  correctionRevision: number;
};
const weekdays = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
};

function dailyCalendar(startDate: string, endDate: string) {
  return {
    providerCalendarId: 'query-date-candidates',
    weekly: { startDate, endDate, weekdays },
    exceptions: [],
  };
}
function civilDate(instant: DateTime) {
  const date = instant.setZone('Asia/Singapore').toISODate();
  if (!date) {
    throw new Error(
      'Departure window is outside the supported civil-date range',
    );
  }
  return date;
}

function tripSelections(
  selection: Awaited<ReturnType<typeof selectRetainedScheduledTimetable>>,
) {
  if (!selection.selected) {
    return [];
  }
  const { timetable } = selection.selected;
  const trips = new Map(
    timetable.timetable.trips.map((trip) => [trip.providerTripId, trip]),
  );
  const calendars = new Map(
    timetable.timetable.calendars.map((calendar) => [
      calendar.providerCalendarId,
      calendar,
    ]),
  );
  const patterns = new Map(
    timetable.patterns.map(({ id, pattern }) => [id, pattern]),
  );
  const allowedPatterns = new Set(selection.patternIds);
  const result: ScheduledTripPatternDateSelection[] = [];
  for (const assignment of timetable.assignments) {
    if (
      !allowedPatterns.has(assignment.patternId) ||
      !assignment.dateRanges.some(
        (range) =>
          selection.serviceDate >= range.startDate &&
          selection.serviceDate <= range.endDate,
      )
    ) {
      continue;
    }
    const trip = trips.get(assignment.providerTripId);
    const pattern = patterns.get(assignment.patternId);
    const calendar = trip && calendars.get(trip.providerCalendarId);
    if (!trip || !pattern || !calendar) {
      throw new Error('Missing verified departure assignment reference');
    }
    if (!isScheduledServiceDate(calendar, selection.serviceDate)) {
      continue;
    }
    result.push({
      trip,
      calendar,
      serviceDate: selection.serviceDate,
      scopes: [
        {
          serviceDates: [selection.serviceDate],
          binding: {
            providerTripId: trip.providerTripId,
            pattern,
            occurrences: trip.stopTimes.map(
              ({ providerStopId, stopSequence }) => ({
                providerStopId,
                stopSequence,
              }),
            ),
          },
        },
      ],
    });
  }
  return result;
}

function untimedDepartureCount(
  selections: readonly ScheduledTripPatternDateSelection[],
  scope: ScheduledTimetableRequestScope,
) {
  let count = 0;
  for (const { trip, scopes } of selections) {
    let lastAlighting = -1;
    for (const [index, stop] of trip.stopTimes.entries()) {
      if (stop.dropOffType !== 1) {
        lastAlighting = index;
      }
    }
    const pattern = scopes[0].binding.pattern;
    for (const [index, stop] of trip.stopTimes.entries()) {
      const canonical = pattern.stops[index];
      if (
        stop.departureSeconds === null &&
        stop.pickupType !== 1 &&
        index < lastAlighting &&
        canonical.stationId === scope.stationId &&
        (scope.platformId === undefined ||
          canonical.platformIds.includes(scope.platformId))
      ) {
        count++;
      }
    }
  }
  return count;
}

/** Local schedule query only; release permission and frequency fallback remain external. */
export async function queryRetainedScheduledDepartures(options: {
  storeDir: string;
  dataDir: string;
  scope: ScheduledTimetableRequestScope;
  startInstant: string;
  endInstant: string;
  limit?: number;
}) {
  const { storeDir, dataDir, startInstant, endInstant } = options;
  const scope = ScheduledTimetableRequestScopeSchema.parse(options.scope);
  const limit = z.number().int().positive().optional().parse(options.limit);
  const window = { startInstant, endInstant };
  // Share the resolver's instant validation before reading any files.
  scheduledDeparturesWithPatternsInWindow([], window);
  const start = DateTime.fromISO(startInstant, { setZone: true });
  const end = DateTime.fromISO(endInstant, { setZone: true });
  if (
    !start.isValid ||
    !end.isValid ||
    end.toMillis() - start.toMillis() > 86_400_000
  ) {
    throw new Error('Departure queries require a window of at most 24 hours');
  }
  const topology = await buildScheduleTopologyFingerprint(dataDir);
  const history = await readScheduledTimetableHistory(storeDir);
  const unavailableArtifacts: { manifestSha256: string; detail: string }[] = [];
  let maximumOffset = 0;
  for (const version of history) {
    if (version.manifest.identity.topology.sha256 !== topology.sha256) {
      continue;
    }
    try {
      const { timetable } = await readRetainedScheduledTimetable(
        storeDir,
        version.manifestSha256,
      );
      for (const trip of timetable.timetable.trips) {
        for (const stop of trip.stopTimes) {
          maximumOffset = Math.max(maximumOffset, stop.departureSeconds ?? 0);
        }
      }
    } catch (error) {
      unavailableArtifacts.push({
        manifestSha256: version.manifestSha256,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const firstDate = civilDate(start.minus({ seconds: maximumOffset }));
  const lastDate = civilDate(end);
  const serviceDates = [
    ...new Set([
      ...scheduledServiceDatesForWindow(
        dailyCalendar(firstDate, lastDate),
        window,
        maximumOffset,
      ),
      ...scheduledServiceDatesForWindow(
        dailyCalendar(civilDate(start), lastDate),
        window,
        86_400,
      ),
    ]),
  ].sort();
  const serviceDays: {
    serviceDate: string;
    manifestSha256: string | null;
    attempts: Awaited<
      ReturnType<typeof selectRetainedScheduledTimetable>
    >['attempts'];
  }[] = [];
  const departures: RetainedScheduledDeparture[] = [];
  let untimedDepartures = 0;
  for (const serviceDate of serviceDates) {
    const selection = await selectFromRetainedTimetableHistory(
      {
        storeDir,
        dataDir,
        serviceDate,
        scope,
      },
      history,
    );
    const selected = selection.selected;
    serviceDays.push({
      serviceDate,
      manifestSha256: selected?.manifestSha256 ?? null,
      attempts: selection.attempts,
    });
    if (!selected) {
      continue;
    }
    const selections = tripSelections(selection);
    untimedDepartures += untimedDepartureCount(selections, scope);
    for (const departure of scheduledDeparturesWithPatternsInWindow(
      selections,
      window,
      { boardingOnly: true },
    )) {
      if (
        departure.stationId !== scope.stationId ||
        (scope.platformId !== undefined &&
          !departure.platformIds.includes(scope.platformId))
      ) {
        continue;
      }
      departures.push({
        ...departure,
        basis: 'scheduled',
        precision: departure.timepoint === 0 ? 'approximate' : 'exact',
        manifestSha256: selected.manifestSha256,
        snapshotSha256: selected.manifest.capture.sha256,
        retrievedAt: selected.manifest.capture.retrieved_at,
        correctionRevision: selected.manifest.correctionRevision,
      });
    }
  }
  departures.sort(
    (left, right) =>
      Date.parse(left.departureInstant) - Date.parse(right.departureInstant) ||
      compareStrings(left.serviceDate, right.serviceDate) ||
      compareStrings(left.providerTripId, right.providerTripId),
  );
  return {
    scope,
    window,
    serviceDays,
    unavailableArtifacts,
    untimedDepartureCount: untimedDepartures,
    complete:
      untimedDepartures === 0 &&
      unavailableArtifacts.length === 0 &&
      serviceDays.every((day) => day.manifestSha256 !== null),
    departures: limit === undefined ? departures : departures.slice(0, limit),
  };
}
