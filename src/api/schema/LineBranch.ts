import z from 'zod';

export const LineBranchSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    titleTranslations: z.record(z.string(), z.string()),
    startedAt: z.iso.date().nullable(),
    endedAt: z.iso.date().nullable(),
    stationIds: z.array(z.string()).meta({
      description: 'List of station IDs in this branch, ordered by sequence.',
    }),
  })
  .meta({
    ref: 'LineBranch',
    description: 'A branch of a line, consisting of multiple stations.',
  });
export type LineBranch = z.infer<typeof LineBranchSchema>;
