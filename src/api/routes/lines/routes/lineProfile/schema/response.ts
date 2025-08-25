import type z from 'zod';
import { LineProfileSchema } from '../../../../../schema/LineProfile.js';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: LineProfileSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
