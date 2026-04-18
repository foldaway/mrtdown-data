import z from 'zod';
import { TranslationsSchema } from './common.js';

/**
 * Operator
 */
export const OperatorSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  foundedAt: z.iso.date(),
  url: z.url().nullable(),
});
export type Operator = z.infer<typeof OperatorSchema>;
