import z from 'zod';

export const ParamSchema = z.object({
  day: z.string().regex(/^(0[1-9]|[12][0-9]|3[01])$/, 'Day must be 01-31'),
});
