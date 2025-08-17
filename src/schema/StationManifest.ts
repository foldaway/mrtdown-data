import { z } from 'zod';
import { StationSchema } from './Station.js';
import { IssueReferenceSchema } from './Overview.js';
import { ComponentIdSchema, ComponentSchema } from './Component.js';

export const StationManifestSchema = z.object({
  station: StationSchema,
  issueRefs: z.array(IssueReferenceSchema),
  componentsById: z.record(ComponentIdSchema, ComponentSchema),
});
export type StationManifest = z.infer<typeof StationManifestSchema>;
