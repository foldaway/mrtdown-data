import { z } from 'zod';
import { DateSummarySchema } from './DateSummary';
import { IssueReferenceSchema } from './Overview';
import { IssueSchema } from './Issue';

export const StatisticsSchema = z.object({
  dates: z.record(z.string().date(), DateSummarySchema),
  issuesOngoing: z.array(IssueSchema),
  issueHistoricalCount: z.number(),
  issueHistoricalDurationTotalDays: z.number(),
  issueDisruptionLongest: z.array(IssueReferenceSchema),
});
export type Statistics = z.infer<typeof StatisticsSchema>;
