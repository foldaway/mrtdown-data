import { z } from 'zod';

/**
 * This is provisioned for a future standalone Town entity.
 */

export const TownSchema = z.object({
  id: z.string(),
  title: z.string(),
  title_translations: z
    .object({
      'zh-Hans': z.string(),
      ms: z.string(),
      ta: z.string(),
    })
    .describe('Translations of the title field'),
});
export type Town = z.infer<typeof TownSchema>;
