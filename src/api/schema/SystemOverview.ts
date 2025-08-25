import z from 'zod';
import { LineSummaryBasic } from './LineSummary.js';

export const SystemOverviewSchema = z
  .object({
    issueOngoingIds: z.array(z.string()).meta({
      description: 'List of ongoing issues in the network.',
    }),
    lineSummaries: z.array(LineSummaryBasic),
  })
  .meta({
    ref: 'SystemOverview',
    description:
      'Overview of the entire system, including ongoing issues and line summaries.',
  });
export type SystemOverview = z.infer<typeof SystemOverviewSchema>;
