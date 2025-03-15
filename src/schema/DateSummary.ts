import { z } from 'zod';
import { IssueTypeSchema } from './Issue';
import { IssueReferenceSchema } from './Overview';

export const DateSummarySchema = z.object({
  issueTypesDurationMs: z.record(IssueTypeSchema, z.number()),
  issues: z.array(IssueReferenceSchema),
});

export type DateSummary = z.infer<typeof DateSummarySchema>;
