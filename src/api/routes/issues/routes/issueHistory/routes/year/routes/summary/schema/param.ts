import z from 'zod';

export const ParamSchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'Year must be 4 digits'),
});
