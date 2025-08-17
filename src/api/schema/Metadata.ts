import z from 'zod';

export const MetadataSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .meta({ title: 'Metadata' });
export type Metadata = z.infer<typeof MetadataSchema>;
