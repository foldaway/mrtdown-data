import { z } from 'zod';
import { IssueTypeSchema } from './Issue';
import { IssueReferenceSchema } from './Overview';
import { ComponentIdSchema } from './Component';

export const DateSummarySchema = z.object({
  issueTypesDurationMs: z.record(IssueTypeSchema, z.number()),
  componentIdsIssueTypesDurationMs: z.record(
    ComponentIdSchema,
    z.record(IssueTypeSchema, z.number()),
  ),
  issueTypesIntervalsNoOverlapMs: z.record(
    IssueTypeSchema,
    z.array(z.string()),
  ),
  componentIdsIssueTypesIntervalsNoOverlapMs: z.record(
    ComponentIdSchema,
    z.record(IssueTypeSchema, z.array(z.string())),
  ),
  issues: z.array(IssueReferenceSchema),
});

export type DateSummary = z.infer<typeof DateSummarySchema>;
