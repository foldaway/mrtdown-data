import z from 'zod';
import { TranslationsSchema } from './common.js';

/**
 * Line operator
 */
export const LineOperatorSchema = z.object({
  operatorId: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
});
export type LineOperator = z.infer<typeof LineOperatorSchema>;

/**
 * Operating hours for weekday/weekend service windows.
 * Used by API uptime calculations.
 */
export const LineOperatingHoursSchema = z.object({
  weekdays: z.object({
    start: z.string(), // HH:mm
    end: z.string(),
  }),
  weekends: z.object({
    start: z.string(),
    end: z.string(),
  }),
});
export type LineOperatingHours = z.infer<typeof LineOperatingHoursSchema>;

export const LineSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  type: z.enum(['mrt.high', 'mrt.medium', 'lrt']),
  color: z.string(),
  startedAt: z.iso.date().nullable(),
  serviceIds: z.array(z.string()),
  operators: z.array(LineOperatorSchema),
  operatingHours: LineOperatingHoursSchema.optional(),
});
export type Line = z.infer<typeof LineSchema>;
