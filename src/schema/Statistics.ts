import { z } from 'zod';
import { DateSummarySchema } from './DateSummary';
import { IssueReferenceSchema } from './Overview';
import { IssueSchema } from './Issue';
import { ComponentIdSchema } from './Component';

export const StatisticsSchema = z.object({
  dates: z.record(z.string().date(), DateSummarySchema),
  issuesOngoing: z.array(IssueSchema),
  issuesDisruptionHistoricalCount: z.number(),
  issuesDisruptionDurationTotalDays: z.number(),
  issuesDisruptionLongest: z.array(IssueReferenceSchema),
  componentsIssuesDisruptionCount: z.record(ComponentIdSchema, z.number()),
});
export type Statistics = z.infer<typeof StatisticsSchema>;
