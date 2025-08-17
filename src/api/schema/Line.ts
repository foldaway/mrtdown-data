import z from 'zod';
import {
  ComponentOperatingHours,
  ComponentTypeSchema,
} from '../../schema/Component.js';

export const LineTypeSchema = ComponentTypeSchema.meta({
  ref: 'LineType',
  description: 'The type of a line.',
});
export type LineType = z.infer<typeof LineTypeSchema>;

export const LineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    titleTranslations: z.record(z.string(), z.string()),
    type: LineTypeSchema,
    color: z.string(),
    startedAt: z.iso.datetime().nullable(),
    operatingHours: ComponentOperatingHours,
  })
  .meta({
    ref: 'Line',
    description: 'Represents a line in the network.',
  });
export type Line = z.infer<typeof LineSchema>;
