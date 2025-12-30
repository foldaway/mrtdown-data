import z from 'zod';

export const ParamSchema = z.object({
  operatorId: z.string(),
});
