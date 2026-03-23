import z from 'zod';
import { TranslationsMetaSchema, TranslationsSchema } from '../common.js';
import { IssueIdSchema } from './id.js';
import { IssueTypeSchema } from './issueType.js';

export const IssueSchema = z.object({
  id: IssueIdSchema,
  type: IssueTypeSchema,
  title: TranslationsSchema,
  titleMeta: TranslationsMetaSchema,
});
export type Issue = z.infer<typeof IssueSchema>;
