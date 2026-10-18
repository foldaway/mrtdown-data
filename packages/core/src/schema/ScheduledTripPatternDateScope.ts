import z from 'zod';
import { ScheduledTripPatternBindingSchema } from './ScheduledTripPatternBinding.js';

export const ScheduledTripPatternDateScopeSchema = z
  .object({
    binding: ScheduledTripPatternBindingSchema,
    serviceDates: z
      .array(z.iso.date())
      .min(1)
      .refine((dates) => new Set(dates).size === dates.length, {
        message: 'Binding service dates must be unique',
      })
      .transform((dates) => [...dates].sort()),
  })
  .strict();

export type ScheduledTripPatternDateScope = z.infer<
  typeof ScheduledTripPatternDateScopeSchema
>;
