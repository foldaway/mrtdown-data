import z from 'zod';
import { TranslationsSchema } from './common.js';

export const LandmarkSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
});
export type Landmark = z.infer<typeof LandmarkSchema>;
