import type z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';
import { OperatorProfileSchema } from '../../../../../schema/OperatorProfile.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: OperatorProfileSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
