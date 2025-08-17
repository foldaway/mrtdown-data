import { z } from 'zod';
import { IssueTypeSchema } from './Issue.js';
import { IssueReferenceSchema } from './Overview.js';
import { ComponentIdSchema } from './Component.js';

export const DateSummarySchema = z.object({
  issueTypesDurationMs: z.partialRecord(IssueTypeSchema, z.number()),
  componentIdsIssueTypesDurationMs: z.partialRecord(
    ComponentIdSchema,
    z.partialRecord(IssueTypeSchema, z.number()),
  ),
  issueTypesIntervalsNoOverlapMs: z.partialRecord(
    IssueTypeSchema,
    z.array(z.string()),
  ),
  componentIdsIssueTypesIntervalsNoOverlapMs: z.record(
    ComponentIdSchema,
    z.partialRecord(IssueTypeSchema, z.array(z.string())),
  ),
  issues: z.array(IssueReferenceSchema),
});

export type DateSummary = z.infer<typeof DateSummarySchema>;
