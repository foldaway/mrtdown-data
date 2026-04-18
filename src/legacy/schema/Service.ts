import z from 'zod';
import { TranslationsSchema } from './Translations.js';

export const ServiceSchema = z
  .object({
    id: z.string(),
    name: TranslationsSchema,
  })
  .meta({
    ref: 'Service',
    description: 'A service on a line.',
  });
export type Service = z.infer<typeof ServiceSchema>;
