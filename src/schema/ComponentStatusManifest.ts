import { z } from 'zod';
import { ComponentIdSchema, ComponentSchema } from './Component.js';
import { StationSchema } from './Station.js';
import { IssueReferenceSchema } from './Overview.js';
import { DateSummarySchema } from './DateSummary.js';
import { IssueSchema, IssueTypeSchema } from './Issue.js';

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
