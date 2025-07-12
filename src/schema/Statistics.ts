import { z } from 'zod';
import { DateSummarySchema } from './DateSummary';
import { IssueReferenceSchema } from './Overview';
import { IssueSchema } from './Issue';
import { ComponentIdSchema, ComponentSchema } from './Component';
import { StationSchema } from './Station';

export const StatisticsSchema = z.object({
  dates: z.record(z.string().date(), DateSummarySchema),
  issuesDisruptionHistoricalCount: z.number(),
  issuesDisruptionDurationTotalDays: z.number(),
  issuesDisruptionLongest: z.array(IssueReferenceSchema),
  componentsIssuesDisruptionCount: z.record(ComponentIdSchema, z.number()),
  // Includes all issues that are either open-ended or end after the current product build time.
  issuesOngoingSnapshot: z.array(IssueSchema),
  stationIssues: z.array(
    z.object({
      station: StationSchema,
      count: z.number(),
    }),
  ),
  componentsById: z.record(ComponentIdSchema, ComponentSchema),
});
export type Statistics = z.infer<typeof StatisticsSchema>;
