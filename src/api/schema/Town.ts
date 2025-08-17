import z from 'zod';

export const TownSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nameTranslations: z.record(z.string(), z.string()),
  })
  .meta({
    ref: 'Town',
    description: 'A town or city where stations are located.',
  });
export type Town = z.infer<typeof TownSchema>;
