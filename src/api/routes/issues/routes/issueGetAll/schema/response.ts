import z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    issueIds: z.array(z.string()),
    monthEarliest: z.string(),
    monthLatest: z.string(),
  }),
});
export type Response = z.infer<typeof ResponseSchema>;
