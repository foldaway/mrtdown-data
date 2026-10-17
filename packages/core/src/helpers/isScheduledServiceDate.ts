import z from 'zod';
import {
  type ScheduledServiceCalendar,
  ScheduledServiceCalendarSchema,
} from '../schema/ScheduledServiceCalendar.js';

const civilDate = z.iso.date();
const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Test one civil service date without expanding calendars or inferring holidays. */
export function isScheduledServiceDate(
  input: ScheduledServiceCalendar,
  serviceDate: string,
): boolean {
  const calendar = ScheduledServiceCalendarSchema.parse(input);
  const date = civilDate.parse(serviceDate);
  const exception = calendar.exceptions.find((item) => item.date === date);
  if (exception) return exception.available;
  const weekly = calendar.weekly;
  if (!weekly || date < weekly.startDate || date > weekly.endDate) return false;
  const weekday = weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()];
  if (!weekday) throw new Error(`Invalid service date: ${date}`);
  return weekly.weekdays[weekday];
}
