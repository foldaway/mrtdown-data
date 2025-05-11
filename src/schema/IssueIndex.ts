import { z } from 'zod';

export const IssueIndexSchema = z.array(z.string());
export type IssueIndex = z.infer<typeof IssueIndexSchema>;
