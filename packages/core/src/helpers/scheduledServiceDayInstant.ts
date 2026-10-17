import { Temporal } from '@js-temporal/polyfill';
import z from 'zod';
import { ScheduledServiceDaySecondsSchema } from '../schema/ScheduledStopTime.js';

const civilDate = z.iso.date();

/** Convert an elapsed service-day offset to UTC using Singapore's GTFS time base. */
export function scheduledServiceDayInstant(
  serviceDate: string,
  offsetSeconds: number,
): string {
  const date = civilDate.parse(serviceDate);
  const seconds = ScheduledServiceDaySecondsSchema.parse(offsetSeconds);
  const start = Temporal.PlainDate.from(date)
    .toZonedDateTime({ timeZone: 'Asia/Singapore', plainTime: '12:00' })
    .subtract({ hours: 12 });
  return start.add({ seconds }).toInstant().toString();
}
