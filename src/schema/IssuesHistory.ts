import { z } from 'zod';
import { IssueSchema } from './Issue';

export const IssuesHistorySchema = z.object({
  issues: z.array(IssueSchema),
});
export type IssuesHistory = z.infer<typeof IssuesHistorySchema>;
