import {
  ScheduledServiceCalendarSchema,
  ScheduledWeekdaysSchema,
} from '@mrtdown/core';
import type { ScheduleTables } from './schedule.js';

/** Parse one provider calendar's rules only; this does not approve their real-world validity. */
export function scheduledServiceCalendarFromGtfs(
  tables: ScheduleTables,
  providerCalendarId: string,
) {
  const rows = (tables['calendar.txt'] ?? []).filter(
    (row) => row.service_id === providerCalendarId,
  );
  const exceptions = (tables['calendar_dates.txt'] ?? []).filter(
    (row) => row.service_id === providerCalendarId,
  );
  if (rows.length > 1)
    throw new Error(`Duplicate GTFS calendar: ${providerCalendarId}`);
  if (!rows.length && !exceptions.length)
    throw new Error(`Unknown GTFS calendar: ${providerCalendarId}`);
  const date = (value: string | undefined) => {
    if (!value || !/^\d{8}$/.test(value))
      throw new Error(`Invalid GTFS calendar date: ${value}`);
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  };
  const row = rows[0];
  return ScheduledServiceCalendarSchema.parse({
    providerCalendarId,
    weekly: row
      ? {
          startDate: date(row.start_date),
          endDate: date(row.end_date),
          weekdays: Object.fromEntries(
            Object.keys(ScheduledWeekdaysSchema.shape).map((day) => {
              const flag = row[day];
              if (flag !== '0' && flag !== '1')
                throw new Error(`Invalid GTFS ${day}: ${flag}`);
              return [day, flag === '1'];
            }),
          ),
        }
      : null,
    exceptions: exceptions.map((exception) => {
      if (exception.exception_type !== '1' && exception.exception_type !== '2')
        throw new Error(
          `Invalid GTFS exception_type: ${exception.exception_type}`,
        );
      return {
        date: date(exception.date),
        available: exception.exception_type === '1',
      };
    }),
  });
}
