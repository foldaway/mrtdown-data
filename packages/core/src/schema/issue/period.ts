import z from 'zod';

export const PeriodFixedSchema = z.object({
  kind: z.literal('fixed'),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }).nullable(),
});
export type PeriodFixed = z.infer<typeof PeriodFixedSchema>;

export const PeriodFrequencySchema = z.enum([
  'daily',
  'weekly',
  'monthly',
  'yearly',
]);
export type PeriodFrequency = z.infer<typeof PeriodFrequencySchema>;

export const PeriodRecurringSchema = z.object({
  kind: z.literal('recurring'),
  frequency: PeriodFrequencySchema,
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  daysOfWeek: z
    .array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']))
    .nullable(),
  timeWindow: z.object({
    startAt: z.iso.time(),
    endAt: z.iso.time(),
  }),
  timeZone: z.literal('Asia/Singapore'),
  excludedDates: z.array(z.iso.date()).nullable(),
});
export type PeriodRecurring = z.infer<typeof PeriodRecurringSchema>;

export const PeriodSchema = z.discriminatedUnion('kind', [
  PeriodFixedSchema,
  PeriodRecurringSchema,
]);
export type Period = z.infer<typeof PeriodSchema>;
