import z from 'zod';

export const IssueUpdateSchema = z
  .object({
    type: z.string(),
    text: z.string(),
    sourceUrl: z.string().url().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    ref: 'IssueUpdate',
    description: 'A textual update for an issue',
  });
export type IssueUpdate = z.infer<typeof IssueUpdateSchema>;
