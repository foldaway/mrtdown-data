import z from 'zod';

export const OperatorSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nameTranslations: z.record(z.string(), z.string()),
    foundedAt: z.iso.datetime(),
    url: z.url().nullable(),
  })
  .meta({
    ref: 'Operator',
    description: 'The operator of a line.',
  });
export type Operator = z.infer<typeof OperatorSchema>;
