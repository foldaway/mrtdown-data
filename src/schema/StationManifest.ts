import { z } from 'zod';
import { StationSchema } from './Station';
import { IssueReferenceSchema } from './Overview';

export const StationManifestSchema = z.object({
  station: StationSchema,
  issueRefs: z.array(IssueReferenceSchema),
});
export type StationManifest = z.infer<typeof StationManifestSchema>;
