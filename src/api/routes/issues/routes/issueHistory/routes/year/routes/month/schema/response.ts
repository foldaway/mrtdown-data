import z from 'zod';
import { BaseResponseSchema } from '../../../../../../../../../schema/BaseResponse.js';

export const IssueHistoryPageSchema = z.object({
  startAt: z.string().date(),
  endAt: z.string().date(), 
  issuesByWeek: z.array(z.object({
    week: z.string(),
    issueIds: z.array(z.string()),
  })),
});

export const ResponseSchema = BaseResponseSchema.extend({
  data: IssueHistoryPageSchema,
});
export type Response = z.infer<typeof ResponseSchema>;