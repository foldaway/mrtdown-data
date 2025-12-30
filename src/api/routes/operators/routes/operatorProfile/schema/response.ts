import z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: z.object({
    operatorId: z.string(),
    lineIds: z.array(z.string()).meta({
      description: 'List of line IDs operated by this operator.',
    }),
  }),
});
export type Response = z.infer<typeof ResponseSchema>;
