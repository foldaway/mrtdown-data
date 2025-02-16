import { z } from 'zod';
import { ComponentSchema } from './Component';

export const ComponentsOverviewEntryStatusSchema = z.enum([
  'operational',
  'degraded',
  'minor_outage',
  'major_outage',
  'maintenance',
]);
export type ComponentsOverviewEntryStatus = z.infer<
  typeof ComponentsOverviewEntryStatusSchema
>;

export const ComponentsOverviewEntrySchema = z.object({
  component: ComponentSchema,
  status: ComponentsOverviewEntryStatusSchema,
});
export type ComponentsOverviewEntry = z.infer<
  typeof ComponentsOverviewEntrySchema
>;

export const ComponentsOverviewSchema = z.object({
  entries: z.array(ComponentsOverviewEntrySchema),
});
export type ComponentsOverview = z.infer<typeof ComponentsOverviewSchema>;
