import { Temporal } from '@js-temporal/polyfill';
import z from 'zod';
import { ScheduledServiceDaySecondsSchema } from '../schema/ScheduledStopTime.js';

const civilDate = z.iso.date();
// Projection walks one date at a time and repeats many arrival/departure offsets.
// Retain only one date and bound offsets even for unusual producer inputs.
const maximumCachedOffsets = 100_000;
let cachedDate: string | undefined;
let cachedStart: Temporal.Instant | undefined;
const cachedInstants = new Map<number, string>();

/** Convert an elapsed service-day offset to UTC using Singapore's GTFS time base. */
export function scheduledServiceDayInstant(
  serviceDate: string,
  offsetSeconds: number,
): string {
  const date = civilDate.parse(serviceDate);
  const seconds = ScheduledServiceDaySecondsSchema.parse(offsetSeconds);
  if (cachedDate !== date || !cachedStart) {
    cachedStart = Temporal.PlainDate.from(date)
      .toZonedDateTime({ timeZone: 'Asia/Singapore', plainTime: '12:00' })
      .subtract({ hours: 12 })
      .toInstant();
    cachedDate = date;
    cachedInstants.clear();
  }
  const cached = cachedInstants.get(seconds);
  if (cached !== undefined) return cached;
  const instant = cachedStart.add({ seconds }).toString();
  if (cachedInstants.size >= maximumCachedOffsets) cachedInstants.clear();
  cachedInstants.set(seconds, instant);
  return instant;
}
