import z from 'zod';

export const LandmarkSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nameTranslations: z.record(z.string(), z.string()),
  })
  .meta({
    ref: 'Landmark',
    description: 'A notable landmark near a station.',
  });
export type Landmark = z.infer<typeof LandmarkSchema>;
