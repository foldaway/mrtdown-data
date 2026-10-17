import z from 'zod';
import { ScheduledStopTimeSchema } from './ScheduledStopTime.js';

/** Ordered source-trip timing only, without canonical allocation or service dates. */
export const ScheduledTripTimesSchema = z
  .object({
    providerTripId: z.string().min(1),
    providerRouteId: z.string().min(1),
    providerCalendarId: z.string().min(1),
    stopTimes: z.array(ScheduledStopTimeSchema).min(2),
  })
  .strict()
  .superRefine((value, context) => {
    let previousSequence: bigint | null = null;
    let previousTime: number | null = null;
    for (const [index, stop] of value.stopTimes.entries()) {
      const issue = (field: string, message: string) =>
        context.addIssue({
          code: 'custom',
          path: ['stopTimes', index, field],
          message,
        });
      if (stop.providerTripId !== value.providerTripId)
        issue('providerTripId', 'Stop occurrence belongs to a different trip');
      // Child regex validation can report issues without aborting this refinement.
      if (/^\d+$/.test(stop.stopSequence)) {
        const sequence = BigInt(stop.stopSequence);
        if (previousSequence !== null && sequence <= previousSequence)
          issue('stopSequence', 'Stop sequences must strictly increase');
        previousSequence = sequence;
      }
      if (
        (index === 0 || index === value.stopTimes.length - 1) &&
        stop.arrivalSeconds === null
      )
        issue('arrivalSeconds', 'Trip boundaries require an arrival time');
      for (const field of ['arrivalSeconds', 'departureSeconds'] as const) {
        const seconds = stop[field];
        if (seconds === null) continue;
        if (previousTime !== null && seconds < previousTime)
          issue(field, 'Trip times cannot precede an earlier known event');
        previousTime = seconds;
      }
    }
  });

export type ScheduledTripTimes = z.infer<typeof ScheduledTripTimesSchema>;
