import z from 'zod';
import { TimeScaleChartSchema, ChartSchema } from './Chart.js';

export const SystemAnalyticsSchema = z
  .object({
    timeScaleChartsIssueCount: z.array(TimeScaleChartSchema),
    timeScaleChartsIssueDuration: z.array(TimeScaleChartSchema),
    chartTotalIssueCountByLine: ChartSchema,
    chartTotalIssueCountByStation: ChartSchema,
    chartRollingYearHeatmap: ChartSchema, // The data here is similar to the issue counts chart, but it uses a granularity and time scale that isn't available there.
    issueIdsDisruptionLongest: z.array(z.string()),
  })
  .meta({
    ref: 'SystemAnalytics',
    description:
      'System-level analytics, including various graphs and breakdowns.',
  });
export type SystemAnalytics = z.infer<typeof SystemAnalyticsSchema>;
