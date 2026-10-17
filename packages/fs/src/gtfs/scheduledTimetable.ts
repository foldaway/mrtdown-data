import { ScheduledTimetableSchema } from '@mrtdown/core';
import { compareStrings } from './order.js';
import type { ScheduleTables } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';

export function scheduledTimetableFromGtfs(tables: ScheduleTables) {
  const agencies = tables['agency.txt'] ?? [];
  if (
    !agencies.length ||
    agencies.some((agency) => agency.agency_timezone !== 'Asia/Singapore')
  ) {
    throw new Error(
      'Source timetable requires Asia/Singapore agency timezones',
    );
  }
  if (tables['frequencies.txt']?.length) {
    throw new Error('Source timetable does not support frequency-based trips');
  }
  const trips = scheduledTripTimesFromGtfs(tables);
  const calendarIds = new Set(
    [
      ...(tables['calendar.txt'] ?? []),
      ...(tables['calendar_dates.txt'] ?? []),
    ].map((row) => row.service_id ?? ''),
  );
  return ScheduledTimetableSchema.parse({
    schemaVersion: 1,
    timeZone: 'Asia/Singapore',
    calendars: [...calendarIds]
      .sort(compareStrings)
      .map((id) => scheduledServiceCalendarFromGtfs(tables, id)),
    trips,
  });
}
