import { z } from 'zod';
import { ComponentIdSchema, ComponentSchema } from './Component.js';
import { StationSchema } from './Station.js';
import { IssueReferenceSchema } from './Overview.js';

export const ComponentManifestSchema = z.object({
  componentId: ComponentIdSchema,
  componentsById: z.record(ComponentIdSchema, ComponentSchema),
  stationsByCode: z.record(z.string(), StationSchema),
  issueRefs: z.array(IssueReferenceSchema),
});
export type ComponentManifest = z.infer<typeof ComponentManifestSchema>;
