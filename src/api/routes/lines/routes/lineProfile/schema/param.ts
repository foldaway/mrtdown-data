import z from 'zod';

export const ParamSchema = z.object({
  lineId: z.string(),
});
