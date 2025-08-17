import type z from 'zod';
import { BaseResponseSchema } from '../../../../../schema/BaseResponse.js';
import { StationProfileSchema } from '../../../../../schema/StationProfile.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: StationProfileSchema,
});
export type Response = z.infer<typeof ResponseSchema>;
