import z from 'zod';
import { LineSummaryBasic, LineSummarySchema } from './LineSummary.js';

export const SystemOverviewSchema = z
  .object({
    issueIdsActiveNow: z.array(z.string()).meta({
      description: 'List of issues that are active right now.',
    }),
    issueIdsActiveToday: z.array(z.string()).meta({
      description: 'List of issues that are active at some point today.',
    }),
    lineSummaries: z.array(LineSummarySchema).meta({
      description: 'Summaries of all lines in the system.',
    }),
  })
  .meta({
    ref: 'SystemOverview',
    description:
      'Overview of the entire system, including ongoing issues and line summaries.',
  });
export type SystemOverview = z.infer<typeof SystemOverviewSchema>;
