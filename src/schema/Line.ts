import { z } from 'zod';
import { StationIdSchema } from './StationId.js';

export const LineTypeSchema = z
  .enum(['mrt.high', 'mrt.medium', 'lrt'])
  .meta({
    ref: 'LineType',
    description: 'The type of the transit line.',
  });
export type LineType = z.infer<typeof LineTypeSchema>;

export const LineIdSchema = z
  .string()
  .refine((val) => /^[A-Z]{3,10}$/.test(val));
export type LineId = z.infer<typeof LineIdSchema>;

export const LineBranchSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_translations: z.record(z.string(), z.string()),
  startedAt: z.string().date().nullable(),
  endedAt: z.string().date().nullable(),
  stationCodes: z.array(StationIdSchema),
});
export type LineBranch = z.infer<typeof LineBranchSchema>;

export const LineOperatingHours = z.object({
  weekdays: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
  weekends: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
});
export type LineOperatingHours = z.infer<typeof LineOperatingHours>;

export const LineSchema = z.object({
  id: LineIdSchema,
  title: z.string(),
  title_translations: z.record(z.string(), z.string()),
  type: LineTypeSchema,
  color: z.string().refine((val) => /^#([A-Fa-f0-9]{6})/.test(val)),
  startedAt: z.string().date(),
  branches: z.record(z.string(), LineBranchSchema),
  operatingHours: LineOperatingHours,
});
export type Line = z.infer<typeof LineSchema>;
