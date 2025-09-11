import z from 'zod';

export const QuerySchema = z.object({
  days: z.coerce.number().int().min(30).max(90).default(90).optional(),
});
