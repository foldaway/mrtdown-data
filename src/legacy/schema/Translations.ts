import { z } from 'zod';

/**
 * Translations object format.
 * `en-SG` is mandatory; other locales are optional.
 */
export const TranslationsSchema = z.object({
  'en-SG': z.string(),
  'zh-Hans': z.string().nullable(),
  ms: z.string().nullable(),
  ta: z.string().nullable(),
});
export type Translations = z.infer<typeof TranslationsSchema>;
