import { z } from 'zod';

/**
 * Translations
 *
 * `en` is mandatory.
 */
export const TranslationsSchema = z.object({
  'en-SG': z.string(),
  'zh-Hans': z.string().nullable(),
  ms: z.string().nullable(),
  ta: z.string().nullable(),
});
export type Translations = z.infer<typeof TranslationsSchema>;

export const TranslationsMetaSchema = z.object({
  source: z.string(),
});
export type TranslationsMeta = z.infer<typeof TranslationsMetaSchema>;

export const OperatingHoursSchema = z.object({
  weekdays: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
  weekends: z.object({
    start: z.iso.time(),
    end: z.iso.time(),
  }),
});
export type OperatingHours = z.infer<typeof OperatingHoursSchema>;
