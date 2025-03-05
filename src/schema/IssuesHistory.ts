import { z } from 'zod';
import { IssueSchema } from './Issue';

export const IssuesHistorySchema = z.object({
  pageCount: z.number(),
  fileNames: z.array(z.string()),
});
export type IssuesHistory = z.infer<typeof IssuesHistorySchema>;

export const IssuesHistoryPageSchema = z.object({
  pageNo: z.number(),
  issues: z.array(IssueSchema),
});
export type IssuesHistoryPage = z.infer<typeof IssuesHistoryPageSchema>;
