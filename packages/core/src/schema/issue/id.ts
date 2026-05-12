import { z } from 'zod';

export const IssueIdSchema = z
  .string()
  .refine((val) => /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val))
  .describe('YYYY-MM-DD followed by a lowercase blog post-like slug');
export type IssueId = z.infer<typeof IssueIdSchema>;
