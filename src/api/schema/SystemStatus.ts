import z from 'zod';
import { LineSummarySchema } from './LineSummary.js';

export const SystemStatusSchema = z
  .object({
    lineSummaries: z.array(LineSummarySchema),
    issueOngoingIds: z.array(z.string()).meta({
      description: 'List of ongoing issues in the network.',
    }),
  })
  .meta({
    ref: 'SystemStatus',
    description:
      'Overall status of the transit system, including line summaries and ongoing issues.',
  });
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
