import z from 'zod';
import { PlatformGroupTargetSchema } from './groupedPlatforms.js';
import {
  entityDecision,
  patternDecision,
  ScopedReconciliationApprovalSchema,
  ScopedReconciliationDraftSchema,
  scopedReviewDraftFingerprint,
} from './scopedReviewContract.js';

const groupedEntityDecision = entityDecision.extend({
  target: z
    .union([entityDecision.shape.target.unwrap(), PlatformGroupTargetSchema])
    .optional(),
});

export const GroupedScopedReconciliationDraftSchema =
  ScopedReconciliationDraftSchema.extend({
    schemaVersion: z.literal(3),
    decisions: z.array(
      z
        .union([groupedEntityDecision, patternDecision])
        .superRefine((value, context) => {
          if ((value.disposition === 'matched') !== Boolean(value.target))
            context.addIssue({
              code: 'custom',
              message: 'Only matched decisions require a target',
            });
          if (value.target?.kind === 'platformGroup' && value.kind !== 'stop')
            context.addIssue({
              code: 'custom',
              message: 'Only stop decisions can target a platform group',
            });
        }),
    ),
  });

export type GroupedScopedReconciliationDraft = z.infer<
  typeof GroupedScopedReconciliationDraftSchema
>;
export type GroupedScopedReviewDecision =
  GroupedScopedReconciliationDraft['decisions'][number];

export const GroupedScopedReconciliationApprovalSchema =
  ScopedReconciliationApprovalSchema.extend({ schemaVersion: z.literal(3) });

export function groupedScopedReviewDraftSha256(input: unknown) {
  return scopedReviewDraftFingerprint(
    GroupedScopedReconciliationDraftSchema.parse(input),
  );
}
