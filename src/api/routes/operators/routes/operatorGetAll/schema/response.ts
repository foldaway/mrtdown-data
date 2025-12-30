import z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    operatorIds: z.array(z.string()),
  }),
});
export type Response = z.infer<typeof ResponseSchema>;
