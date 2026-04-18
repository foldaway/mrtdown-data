import z from 'zod';
import { TranslationsSchema } from '#schema/common.js';
import { IssueIdSchema } from './id.js';
import { IssueTypeSchema } from './issueType.js';

export const IssueSchema = z.object({
  id: IssueIdSchema,
  type: IssueTypeSchema,
  title: TranslationsSchema,
  titleMeta: z.object({
    source: z.string(),
  }),
});
export type Issue = z.infer<typeof IssueSchema>;
