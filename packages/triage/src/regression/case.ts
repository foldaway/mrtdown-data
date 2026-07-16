import { IngestContentSchema } from '@mrtdown/ingest-contracts';
import { z } from 'zod';

export const RegressionFailureLabels = [
  'relevance',
  'issue-triage',
  'entity-selection',
  'effect',
  'scope',
  'period',
  'state-transition',
  'presentation',
  'workflow-integrity',
] as const;

export const RegressionFailureLabelSchema = z.enum(RegressionFailureLabels);
export type RegressionFailureLabel = z.infer<
  typeof RegressionFailureLabelSchema
>;

const GitRevisionSchema = z.string().regex(/^[0-9a-f]{7,40}$/);

const PullRequestSourceSchema = z.object({
  kind: z.literal('pull-request'),
  number: z.number().int().positive(),
  url: z.url(),
  baseRevision: GitRevisionSchema,
  candidateRevision: GitRevisionSchema,
  resolutionRevision: GitRevisionSchema.nullable(),
});

const CommitSourceSchema = z.object({
  kind: z.literal('commit'),
  url: z.url(),
  baseRevision: GitRevisionSchema,
  candidateRevision: GitRevisionSchema,
  resolutionRevision: GitRevisionSchema.nullable(),
});

const RegressionSourceSchema = z.discriminatedUnion('kind', [
  PullRequestSourceSchema,
  CommitSourceSchema,
]);

const IngestContentInputSchema = z.object({
  kind: z.literal('ingest-content'),
  content: IngestContentSchema,
});

const ModelEvidenceInputSchema = z.object({
  kind: z.literal('model-evidence'),
  evidence: z.object({
    ts: z.iso.datetime({ offset: true }),
    text: z.string().min(1),
  }),
});

export const RegressionInputSchema = z.discriminatedUnion('kind', [
  IngestContentInputSchema,
  ModelEvidenceInputSchema,
]);
export type RegressionInput = z.infer<typeof RegressionInputSchema>;

const IgnoreOutcomeSchema = z.object({
  kind: z.literal('ignore'),
});

const CreateOutcomeSchema = z.object({
  kind: z.literal('create'),
  issueType: z.enum(['disruption', 'maintenance', 'infra']),
  issueId: z.string().optional(),
});

const UpdateOutcomeSchema = z.object({
  kind: z.literal('update'),
  issueId: z.string(),
});

const QuarantineOutcomeSchema = z.object({
  kind: z.literal('quarantine'),
  reason: z.string().min(1),
});

export const RegressionOutcomeSchema = z.discriminatedUnion('kind', [
  IgnoreOutcomeSchema,
  CreateOutcomeSchema,
  UpdateOutcomeSchema,
  QuarantineOutcomeSchema,
]);
export type RegressionOutcome = z.infer<typeof RegressionOutcomeSchema>;

const SemanticMatchSchema = z.record(z.string(), z.json());

export const RegressionAssertionSchema = z.object({
  kind: z.enum(['claim', 'impact-event']),
  presence: z.enum(['required', 'forbidden']),
  match: SemanticMatchSchema,
});
export type RegressionAssertion = z.infer<typeof RegressionAssertionSchema>;

const RegressionResultSchema = z.object({
  outcome: RegressionOutcomeSchema,
  assertions: z.array(RegressionAssertionSchema).default([]),
});

const ExpectedRegressionResultSchema = RegressionResultSchema.superRefine(
  (result, context) => {
    if (result.outcome.kind === 'create' && result.outcome.issueId != null) {
      context.addIssue({
        code: 'custom',
        message: 'Expected create outcomes cannot specify issueId',
        path: ['outcome', 'issueId'],
      });
    }
  },
);

export const RegressionCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  role: z.enum(['regression', 'positive-control']),
  labels: z.array(RegressionFailureLabelSchema).min(1),
  source: RegressionSourceSchema,
  input: RegressionInputSchema,
  observed: RegressionResultSchema,
  expected: ExpectedRegressionResultSchema,
  rationale: z.string().min(1),
});

export type RegressionCase = z.infer<typeof RegressionCaseSchema>;
