import { z } from 'zod';
import { StationIdSchema } from './StationId';

export const ComponentIdSchema = z
  .string()
  .refine((val) => /^[A-Z]{3,10}$/.test(val));
export type ComponentId = z.infer<typeof ComponentIdSchema>;

export const ComponentBranchSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_translations: z.record(z.string(), z.string()),
  startedAt: z.string().date().nullable(),
  endedAt: z.string().date().nullable(),
  stationCodes: z.array(StationIdSchema),
});
export type ComponentBranch = z.infer<typeof ComponentBranchSchema>;

export const ComponentSchema = z.object({
  id: ComponentIdSchema,
  title: z.string(),
  title_translations: z.record(z.string(), z.string()),
  color: z.string().refine((val) => /^#([A-Fa-f0-9]{6})/.test(val)),
  startedAt: z.string().date(),
  branches: z.record(z.string(), ComponentBranchSchema),
});
export type Component = z.infer<typeof ComponentSchema>;
