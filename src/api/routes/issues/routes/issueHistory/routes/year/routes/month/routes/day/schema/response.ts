import z from 'zod';
import { BaseResponseSchema } from '../../../../../../../../../../../schema/BaseResponse.js';

export const IssueHistoryDayPageSchema = z.object({
  startAt: z.string().date(),
  endAt: z.string().date(),
  issueIds: z.array(z.string()),
});

export const ResponseSchema = BaseResponseSchema.extend({
  data: IssueHistoryDayPageSchema,
});

export type Response = z.infer<typeof ResponseSchema>;
