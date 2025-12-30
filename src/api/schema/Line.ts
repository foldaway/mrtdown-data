import z from 'zod';
import {
  LineOperatingHours,
  LineTypeSchema,
} from '../../schema/Line.js';

export const LineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    titleTranslations: z.record(z.string(), z.string()),
    type: LineTypeSchema,
    color: z.string(),
    startedAt: z.iso.datetime().nullable(),
    operatingHours: LineOperatingHours,
  })
  .meta({
    ref: 'Line',
    description: 'Represents a line in the network.',
  });
export type Line = z.infer<typeof LineSchema>;
