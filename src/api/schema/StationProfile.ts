import z from 'zod';
import { LineSummaryStatusSchema } from './LineSummary.js';
import { IssueTypeSchema } from '../../schema/Issue.js';

export const StationProfileSchema = z
  .object({
    stationId: z.string(),
    status: LineSummaryStatusSchema,
    issueIdsRecent: z.array(z.string()).meta({
      description: 'List of recent issues affecting the station.',
    }),
    issueCountByType: z.partialRecord(IssueTypeSchema, z.number()),
  })
  .meta({
    ref: 'StationProfile',
    description: 'Station Profile',
  });
export type StationProfile = z.infer<typeof StationProfileSchema>;
