import z from 'zod';

export const GranularitySchema = z.enum(['day', 'month', 'year']).meta({
  ref: 'Granularity',
});

export type Granularity = z.infer<typeof GranularitySchema>;
