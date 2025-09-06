import z from 'zod';
import { BaseResponseSchema } from '../../../schema/BaseResponse.js';
import { MetadataSchema } from '../../../schema/Metadata.js';

export const ResponseSchema = BaseResponseSchema.extend({
  data: z.array(MetadataSchema),
});
export type Response = z.infer<typeof ResponseSchema>;
