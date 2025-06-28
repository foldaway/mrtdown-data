import { z } from 'zod';
import { ComponentIdSchema, ComponentSchema } from './Component';
import { StationSchema } from './Station';
import { IssueReferenceSchema } from './Overview';
import { DateSummarySchema } from './DateSummary';
import { IssueSchema, IssueTypeSchema } from './Issue';

export const ComponentStatusManifestSchema = z.object({
  componentId: ComponentIdSchema,
  componentsById: z.record(ComponentIdSchema, ComponentSchema),
  stationsByCode: z.record(z.string(), StationSchema),
  // Includes all issues that are either open-ended or end after the current product build time.
  issuesOngoingSnapshot: z.array(IssueSchema),
  dates: z.record(z.string().date(), DateSummarySchema),
  lastUpdatedAt: z.string().datetime(),
  issuesRecent: z.array(IssueReferenceSchema),
  issueCountByType: z.record(IssueTypeSchema, z.number()),
  lastMajorDisruption: IssueReferenceSchema.nullable(),
});
export type ComponentStatusManifest = z.infer<
  typeof ComponentStatusManifestSchema
>;
