import z from 'zod';
import { TranslationsSchema } from './Translations.js';

export const OperatorSchema = z
  .object({
    id: z.string(),
    name: TranslationsSchema,
    foundedAt: z.iso.datetime(),
    url: z.url().nullable(),
  })
  .meta({
    ref: 'Operator',
    description: 'The operator of a line.',
  });
export type Operator = z.infer<typeof OperatorSchema>;
