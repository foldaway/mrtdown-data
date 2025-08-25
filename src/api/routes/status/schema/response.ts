import type z from 'zod';
import { SystemStatusSchema } from '../../../schema/SystemStatus.js';
import { BaseResponseSchema } from '../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: SystemStatusSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
