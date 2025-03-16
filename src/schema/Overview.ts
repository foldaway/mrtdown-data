import { z } from 'zod';
import { ComponentIdSchema, ComponentSchema } from './Component';
import { IssueIdSchema, IssueSchema, IssueTypeSchema } from './Issue';
import { DateTime } from 'luxon';
import { DateSummarySchema } from './DateSummary';

export const IssueReferenceSchema = z.object({
  id: IssueIdSchema,
  title: z.string(),
  componentIdsAffected: z.array(ComponentIdSchema),
  type: IssueTypeSchema,
  startAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .describe('ISO8601 date'),
  endAt: z
    .string()
    .refine((val) => DateTime.fromISO(val).isValid)
    .nullable()
    .describe('ISO8601 end timestamp of the issue, if applicable.'),
});
export type IssueReference = z.infer<typeof IssueReferenceSchema>;

export const OverviewSchema = z.object({
  components: z.array(ComponentSchema),
  issuesOngoing: z.array(IssueSchema),
  dates: z.record(z.string().date(), DateSummarySchema),
});
export type Overview = z.infer<typeof OverviewSchema>;
