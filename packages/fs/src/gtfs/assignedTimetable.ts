import { ScheduledAssignedTimetableSchema } from '@mrtdown/core';
import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';
import { activeServiceDates } from './reconciliationEvidence.js';
import type { ScheduleTables } from './schedule.js';
import { scheduledTimetableFromGtfs } from './scheduledTimetable.js';
import type { ScheduledTripPatternAssignment } from './scheduledTripAssignment.js';

function dateRanges(
  dates: readonly string[],
  nextActiveDate: ReadonlyMap<string, string>,
) {
  const ranges: { startDate: string; endDate: string }[] = [];
  for (const date of [...dates].sort(compareStrings)) {
    const previous = ranges.at(-1);
    if (previous && nextActiveDate.get(previous.endDate) === date) {
      previous.endDate = date;
    } else {
      ranges.push({ startDate: date, endDate: date });
    }
  }
  return ranges;
}

/** Assignments have passed combined validation against the same source and topology. */
export function compactAssignedTimetable(
  tables: ScheduleTables,
  assignments: readonly ScheduledTripPatternAssignment[],
) {
  const timetable = scheduledTimetableFromGtfs(tables);
  const calendarsByTrip = new Map(
    timetable.trips.map((trip) => [
      trip.providerTripId,
      trip.providerCalendarId,
    ]),
  );
  const nextDatesByCalendar = new Map<string, Map<string, string>>();
  function nextDates(providerTripId: string) {
    const calendarId = calendarsByTrip.get(providerTripId);
    if (!calendarId) {
      throw new Error(`Missing source trip: ${providerTripId}`);
    }
    let next = nextDatesByCalendar.get(calendarId);
    if (!next) {
      const dates = activeServiceDates(tables, calendarId);
      next = new Map(
        dates.slice(0, -1).map((date, index) => [date, dates[index + 1]]),
      );
      nextDatesByCalendar.set(calendarId, next);
    }
    return next;
  }
  const patterns = new Map<
    string,
    ScheduledTripPatternAssignment['scope']['binding']['pattern']
  >();
  const groups = new Map<
    string,
    { providerTripId: string; patternId: string; dates: string[] }
  >();
  for (const { scope } of assignments) {
    const { providerTripId, pattern } = scope.binding;
    const patternId = hashBytes(Buffer.from(JSON.stringify(pattern)));
    patterns.set(patternId, pattern);
    const key = JSON.stringify([providerTripId, patternId]);
    const group = groups.get(key) ?? { providerTripId, patternId, dates: [] };
    group.dates.push(...scope.serviceDates);
    groups.set(key, group);
  }
  return ScheduledAssignedTimetableSchema.parse({
    schemaVersion: 1,
    timetable,
    patterns: [...patterns]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([id, pattern]) => ({ id, pattern })),
    assignments: [...groups.values()]
      .sort(
        (a, b) =>
          compareStrings(a.providerTripId, b.providerTripId) ||
          compareStrings(a.patternId, b.patternId),
      )
      .map(({ dates, ...assignment }) => ({
        ...assignment,
        dateRanges: dateRanges(dates, nextDates(assignment.providerTripId)),
      })),
  });
}
