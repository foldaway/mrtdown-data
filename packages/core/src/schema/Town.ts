import z from 'zod';
import { TranslationsSchema } from './common.js';

export const TownSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
});
export type Town = z.infer<typeof TownSchema>;
