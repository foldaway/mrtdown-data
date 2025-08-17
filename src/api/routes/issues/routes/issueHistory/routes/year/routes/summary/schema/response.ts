import z from 'zod';
import { BaseResponseSchema } from '../../../../../../../../../schema/BaseResponse.js';
import { IssueTypeSchema } from '../../../../../../../../../../schema/Issue.js';

export const IssueHistoryYearSummaryDataSchema = z.object({
  startAt: z.iso.date(),
  endAt: z.iso.date(),
  summaryByMonth: z.array(
    z.object({
      month: z.string(),
      issueCountsByType: z.record(IssueTypeSchema, z.number()),
      totalCount: z.number(),
    }),
  ),
});

export const SummaryResponseSchema = BaseResponseSchema.extend({
  data: IssueHistoryYearSummaryDataSchema,
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;
