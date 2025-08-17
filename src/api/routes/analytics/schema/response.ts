import type z from 'zod';
import { SystemAnalyticsSchema } from '../../../schema/SystemAnalytics.js';
import { BaseResponseSchema } from '../../../schema/BaseResponse.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: SystemAnalyticsSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
