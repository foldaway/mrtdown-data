import { z } from 'zod';
import { IssueSchema } from './Issue';

export const IssuesOverviewSchema = z.object({
  issuesOngoing: z.array(IssueSchema),
});
export type IssuesOverview = z.infer<typeof IssuesOverviewSchema>;
