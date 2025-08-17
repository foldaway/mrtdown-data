import z from 'zod';
import { LineBranchSchema } from './LineBranch.js';
import { LineSummarySchema } from './LineSummary.js';
import { TimeScaleChartSchema } from './Chart.js';
import { IssueTypeSchema } from '../../schema/Issue.js';

export const LineProfileSchema = z
  .object({
    lineId: z.string(),
    lineSummary: LineSummarySchema,
    branches: z.array(LineBranchSchema),
    issueIdNextMaintenance: z.string().nullable().meta({
      description: 'The next scheduled maintenance for the line, if any.',
    }),
    issueIdsRecent: z.array(z.string()).meta({
      description: 'List of recent issues affecting the line.',
    }),
    issueCountByType: z.partialRecord(IssueTypeSchema, z.number()),
    timeScaleGraphsIssueCount: z.array(TimeScaleChartSchema),
    timeScaleGraphsUptimeRatios: z.array(TimeScaleChartSchema),
    stationIdsInterchanges: z.array(z.string()).meta({
      description: 'List of station IDs that are interchanges on this line.',
    }),
  })
  .meta({
    ref: 'LineProfile',
    description: 'Profile of a line, including its details and status.',
  });
export type LineProfile = z.infer<typeof LineProfileSchema>;
