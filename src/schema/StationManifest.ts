import { z } from 'zod';
import { StationSchema } from './Station';
import { IssueReferenceSchema } from './Overview';
import { ComponentIdSchema, ComponentSchema } from './Component';

export const StationManifestSchema = z.object({
  station: StationSchema,
  issueRefs: z.array(IssueReferenceSchema),
  componentsById: z.record(ComponentIdSchema, ComponentSchema),
});
export type StationManifest = z.infer<typeof StationManifestSchema>;
