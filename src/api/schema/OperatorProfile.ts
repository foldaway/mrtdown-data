import z from 'zod';
import { TimeScaleChartSchema } from './Chart.js';
import { IssueTypeSchema } from '../../schema/Issue.js';
import { LineSummaryStatusSchema } from './LineSummary.js';

export const OperatorLinePerformanceSchema = z
  .object({
    lineId: z.string(),
    status: LineSummaryStatusSchema,
    uptimeRatio: z.number().nullable(),
    issueCount: z.number(),
  })
  .meta({
    ref: 'OperatorLinePerformance',
    description:
      'Performance metrics for a single line operated by the operator.',
  });
export type OperatorLinePerformance = z.infer<
  typeof OperatorLinePerformanceSchema
>;

export const OperatorProfileSchema = z
  .object({
    operatorId: z.string(),
    lineIds: z.array(z.string()).meta({
      description: 'List of line IDs operated by this operator.',
    }),
    // Priority 1 - Critical Performance Metrics
    aggregateUptimeRatio: z.number().nullable().meta({
      description:
        'Weighted average uptime ratio across all operated lines (last 90 days).',
    }),
    currentOperationalStatus: z
      .enum([
        'all_operational',
        'some_lines_disrupted',
        'some_lines_under_maintenance',
        'all_lines_closed_for_day',
      ])
      .meta({
        description: 'Current operational status across all lines.',
      }),
    linesAffected: z.array(z.string()).meta({
      description: 'List of line IDs currently affected by issues.',
    }),
    totalIssuesByType: z.partialRecord(IssueTypeSchema, z.number()).meta({
      description:
        'Total issues by type across all operated lines (last 90 days).',
    }),
    // Priority 2 - Network Scale & Context
    totalStationsOperated: z.number().meta({
      description: 'Total number of stations across all operated lines.',
    }),
    issueIdsRecent: z.array(z.string()).meta({
      description:
        'Recent issue IDs across all operated lines (last 10-15 issues).',
    }),
    // Priority 3 - Trend Analysis
    timeScaleGraphsIssueCount: z.array(TimeScaleChartSchema).meta({
      description: 'Issue count trends aggregated across all lines.',
    }),
    timeScaleGraphsUptimeRatios: z.array(TimeScaleChartSchema).meta({
      description: 'Uptime ratio trends aggregated across all lines.',
    }),
    // Priority 4 - Line Comparison
    linePerformanceComparison: z.array(OperatorLinePerformanceSchema).meta({
      description: 'Performance comparison for each operated line.',
    }),
    // Priority 5 - Historical Context
    totalDowntimeDurationSeconds: z.number().meta({
      description: 'Total downtime duration in seconds (last 90 days).',
    }),
    downtimeDurationByIssueType: z
      .partialRecord(IssueTypeSchema, z.number())
      .meta({
        description: 'Downtime duration by issue type (last 90 days).',
      }),
    yearsOfOperation: z.number().nullable().meta({
      description: 'Years of operation calculated from founded date.',
    }),
  })
  .meta({
    ref: 'OperatorProfile',
    description:
      'Profile of an operator, including aggregated metrics across all operated lines.',
  });
export type OperatorProfile = z.infer<typeof OperatorProfileSchema>;
