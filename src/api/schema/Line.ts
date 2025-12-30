import z from 'zod';
import {
  LineOperatingHours,
  LineOperatorSchema,
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
    operators: z.array(LineOperatorSchema),
  })
  .meta({
    ref: 'Line',
    description: 'Represents a line in the network.',
  });
export type Line = z.infer<typeof LineSchema>;
