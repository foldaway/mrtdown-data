import { z } from 'zod';
import { ComponentIdSchema, ComponentSchema } from './Component';
import { IssueIdSchema, IssueSchema, IssueTypeSchema } from './Issue';
import { DateTime } from 'luxon';

export const IssueReferenceSchema = z.object({
  id: IssueIdSchema,
  title: z.string(),
  componentIdsAffected: z.array(ComponentIdSchema),
  type: IssueTypeSchema,
  startAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 date'),
  endAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .nullable()
    .describe('ISO8601 end timestamp of the issue, if applicable.'),
});
export type IssueReference = z.infer<typeof IssueReferenceSchema>;

export const DateSummarySchema = z.object({
  issueTypesDurationMs: z.record(IssueTypeSchema, z.number()),
  issues: z.array(IssueReferenceSchema),
});
export type DateSummary = z.infer<typeof DateSummarySchema>;

export const OverviewComponentSchema = z.object({
  component: ComponentSchema,
  dates: z.record(z.string().date(), DateSummarySchema),
  issueCountByType: z.record(IssueTypeSchema, z.number()),
});
export type OverviewComponent = z.infer<typeof OverviewComponentSchema>;

export const OverviewSchema = z.object({
  components: z.record(z.string(), OverviewComponentSchema),
  issuesOngoing: z.array(IssueSchema),
  dates: z.record(z.string().date(), DateSummarySchema),
});
export type Overview = z.infer<typeof OverviewSchema>;
