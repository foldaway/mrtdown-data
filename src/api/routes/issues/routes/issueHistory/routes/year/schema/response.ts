import z from 'zod';
import { BaseResponseSchema } from '../../../../../../../schema/BaseResponse.js';

export const IssueHistoryYearPageSchema = z.object({
  startAt: z.string().date(),
  endAt: z.string().date(),
  issuesByMonth: z.array(
    z.object({
      month: z.string(),
      issueIds: z.array(z.string()),
    }),
  ),
});

export const ResponseSchema = BaseResponseSchema.extend({
  data: IssueHistoryYearPageSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
