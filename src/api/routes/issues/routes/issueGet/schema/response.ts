import z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';
import { IssueUpdateSchema } from '../../../../../schema/IssueUpdate.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    id: z.string(),
    updates: z.array(IssueUpdateSchema),
  }),
});
export type Response = z.infer<typeof ResponseSchema>;
