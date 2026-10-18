import z from 'zod';
import { ScheduledStopTimeSchema } from './ScheduledStopTime.js';
import { ScheduledTripPatternSchema } from './ScheduledTripPattern.js';

export const ScheduledTripPatternBindingSchema = z
  .object({
    providerTripId: ScheduledStopTimeSchema.shape.providerTripId,
    pattern: ScheduledTripPatternSchema,
    occurrences: z
      .array(
        z
          .object({
            providerStopId: ScheduledStopTimeSchema.shape.providerStopId,
            stopSequence: ScheduledStopTimeSchema.shape.stopSequence,
          })
          .strict(),
      )
      .min(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.occurrences.length !== value.pattern.stops.length) {
      context.addIssue({
        code: 'custom',
        path: ['occurrences'],
        message:
          'Source occurrences and canonical pattern stops must have equal length',
      });
    }
  });

export type ScheduledTripPatternBinding = z.infer<
  typeof ScheduledTripPatternBindingSchema
>;
