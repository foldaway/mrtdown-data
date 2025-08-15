import { z } from 'zod';

/**
 * This is provisioned for a future standalone Landmark entity.
 */

export const LandmarkSchema = z.object({
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
export type Landmark = z.infer<typeof LandmarkSchema>;
