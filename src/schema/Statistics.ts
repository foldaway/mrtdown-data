import { z } from 'zod';
import { DateSummarySchema } from './DateSummary';
import { IssueSchema } from './Issue';

export const StatisticsSchema = z.object({
  dates: z.record(z.string().date(), DateSummarySchema),
  issuesOngoing: z.array(IssueSchema),
});
export type Statistics = z.infer<typeof StatisticsSchema>;
