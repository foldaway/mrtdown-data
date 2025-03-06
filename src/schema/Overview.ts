import { z } from 'zod';
import { ComponentSchema } from './Component';
import { IssueIdSchema, IssueSchema, IssueTypeSchema } from './Issue';

export const IssueReferenceSchema = z.object({
  id: IssueIdSchema,
  title: z.string(),
});
export type IssueReference = z.infer<typeof IssueReferenceSchema>;

export const OverviewComponentDateSummarySchema = z.object({
  issueTypesDurationMs: z.record(IssueTypeSchema, z.number()),
  issues: z.array(IssueReferenceSchema),
});
export type OverviewComponentDateSummary = z.infer<
  typeof OverviewComponentDateSummarySchema
>;

export const OverviewComponentSchema = z.object({
  component: ComponentSchema,
  dates: z.record(z.string().date(), OverviewComponentDateSummarySchema),
});
export type OverviewComponent = z.infer<typeof OverviewComponentSchema>;

export const OverviewSchema = z.object({
  components: z.array(OverviewComponentSchema),
  issuesOngoing: z.array(IssueSchema),
});
export type Overview = z.infer<typeof OverviewSchema>;
