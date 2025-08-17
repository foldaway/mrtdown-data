import type z from 'zod';
import { BaseResponseSchema } from '../../../schema/BaseResponse.js';
import { SystemOverviewSchema } from '../../../schema/SystemOverview.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: SystemOverviewSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
