import z from 'zod';

export const ParamSchema = z.object({
  month: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Month must be 01-12'),
});
