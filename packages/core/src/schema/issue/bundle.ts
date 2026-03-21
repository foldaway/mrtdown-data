import { z } from 'zod';
import { EvidenceSchema } from './evidence.js';
import { ImpactEventSchema } from './impactEvent.js';
import { IssueSchema } from './issue.js';

export const IssueBundleSchema = z.object({
  issue: IssueSchema,
  evidence: z.array(EvidenceSchema),
  impactEvents: z.array(ImpactEventSchema),
  path: z.string().describe('Relative path to issue folder, for debugging'),
});
export type IssueBundle = z.infer<typeof IssueBundleSchema>;
