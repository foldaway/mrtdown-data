import z from 'zod';

export const ParamSchema = z.object({
  issueId: z.string(),
});
