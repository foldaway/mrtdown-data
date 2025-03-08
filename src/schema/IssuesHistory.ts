import { z } from 'zod';
import { IssueReferenceSchema } from './Overview';

export const IssuesHistoryPageSectionSchema = z.object({
  id: z.string(),
  sectionStartAt: z.string().date(),
  sectionEndAt: z.string().date(),
  issueRefs: z.array(IssueReferenceSchema),
});
export type IssuesHistoryPageSection = z.infer<
  typeof IssuesHistoryPageSectionSchema
>;

export const IssuesHistoryPageSchema = z.object({
  startAt: z.string().date(),
  endAt: z.string().date(),
  sections: z.array(IssuesHistoryPageSectionSchema),
});
export type IssuesHistoryPage = z.infer<typeof IssuesHistoryPageSchema>;

export const IssuesHistorySchema = z.object({
  pageCount: z.number(),
  fileNames: z.array(z.string()),
});
export type IssuesHistory = z.infer<typeof IssuesHistorySchema>;
