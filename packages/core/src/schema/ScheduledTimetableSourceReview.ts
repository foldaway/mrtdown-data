import z from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifactIdentity = z
  .object({ manifestSha256: digest, snapshotSha256: digest })
  .strict();
export const ScheduledTimetableSourceReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('scheduled-timetable-source-review'),
    decision: z.enum([
      'baseline',
      'successor',
      'correction',
      'resolve-version-conflict',
    ]),
    predecessor: artifactIdentity.nullable(),
    successor: artifactIdentity,
    reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (review) =>
      (review.decision === 'baseline') === (review.predecessor === null),
    {
      message: 'Only a baseline review has no predecessor',
    },
  );
export type ScheduledTimetableSourceReview = z.infer<
  typeof ScheduledTimetableSourceReviewSchema
>;
