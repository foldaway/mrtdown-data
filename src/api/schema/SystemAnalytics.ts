import z from 'zod';
import { TimeScaleChartSchema, ChartSchema } from './Chart.js';

export const SystemAnalyticsSchema = z
  .object({
    timeScaleChartsIssueCount: z.array(TimeScaleChartSchema),
    timeScaleChartsIssueDuration: z.array(TimeScaleChartSchema),
    chartTotalIssueCountByLine: ChartSchema,
    chartTotalIssueCountByStation: ChartSchema,
    issueIdsDisruptionLongest: z.array(z.string()),
  })
  .meta({
    ref: 'SystemAnalytics',
    description:
      'System-level analytics, including various graphs and breakdowns.',
  });
export type SystemAnalytics = z.infer<typeof SystemAnalyticsSchema>;
