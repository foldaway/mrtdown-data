import z from 'zod';
import { ScheduledServiceCalendarSchema } from './ScheduledServiceCalendar.js';
import { ScheduledTripTimesSchema } from './ScheduledTripTimes.js';

/** Source timing content; provenance and reviewed canonical allocation belong outside it. */
export const ScheduledTimetableSchema = z
  .object({
    schemaVersion: z.literal(1),
    timeZone: z.literal('Asia/Singapore'),
    calendars: z.array(ScheduledServiceCalendarSchema).min(1),
    trips: z.array(ScheduledTripTimesSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const calendarIds = new Set<string>();
    for (const [index, calendar] of value.calendars.entries()) {
      if (calendarIds.has(calendar.providerCalendarId)) {
        context.addIssue({
          code: 'custom',
          path: ['calendars', index, 'providerCalendarId'],
          message: 'Duplicate provider calendar ID',
        });
      }
      calendarIds.add(calendar.providerCalendarId);
    }
    const tripIds = new Set<string>();
    for (const [index, trip] of value.trips.entries()) {
      if (tripIds.has(trip.providerTripId)) {
        context.addIssue({
          code: 'custom',
          path: ['trips', index, 'providerTripId'],
          message: 'Duplicate provider trip ID',
        });
      }
      tripIds.add(trip.providerTripId);
      if (!calendarIds.has(trip.providerCalendarId)) {
        context.addIssue({
          code: 'custom',
          path: ['trips', index, 'providerCalendarId'],
          message: 'Trip references a missing provider calendar',
        });
      }
    }
  });

export type ScheduledTimetable = z.infer<typeof ScheduledTimetableSchema>;
