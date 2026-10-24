import z from 'zod';
import {
  type ScheduledTimetableRequestScope,
  ScheduledTimetableRequestScopeSchema,
} from './timetableScope.js';
import type { RetainedScheduledTimetable } from './timetableStore.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z
  .object({ manifestSha256: digest, snapshotSha256: digest })
  .strict();
export const ScheduledTimetableRollbackReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('scheduled-timetable-rollback-review'),
    from: identity,
    to: identity,
    dateRange: z
      .object({ startDate: z.iso.date(), endDate: z.iso.date() })
      .strict()
      .refine((range) => range.startDate <= range.endDate),
    scope: ScheduledTimetableRequestScopeSchema,
    reviewer: z.string().trim().min(1),
    reviewedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1),
  })
  .strict();
export type ScheduledTimetableRollbackReview = z.infer<
  typeof ScheduledTimetableRollbackReviewSchema
>;

export const ScheduledTimetableRollbackOptionsSchema = z
  .object({
    review: ScheduledTimetableRollbackReviewSchema,
    selectionInstant: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ScheduledTimetableRollbackOptions = z.infer<
  typeof ScheduledTimetableRollbackOptionsSchema
>;

export interface ScheduledTimetableRollbackAssessment {
  status: 'not-applicable' | 'rejected' | 'applied';
  review: ScheduledTimetableRollbackReview;
  selectionInstant: string;
  blockers: string[];
}

/** Internal metadata check; the selector must still validate the target's eligibility. */
export function assessRetainedTimetableRollback(
  rollback: ScheduledTimetableRollbackOptions,
  request: { serviceDate: string; scope: ScheduledTimetableRequestScope },
  selected: RetainedScheduledTimetable | null,
  history: readonly RetainedScheduledTimetable[],
): ScheduledTimetableRollbackAssessment {
  const { review, selectionInstant } = rollback;
  if (
    request.serviceDate < review.dateRange.startDate ||
    request.serviceDate > review.dateRange.endDate ||
    request.scope.stationId !== review.scope.stationId ||
    request.scope.lineId !== review.scope.lineId ||
    request.scope.serviceId !== review.scope.serviceId ||
    request.scope.destinationStationId !== review.scope.destinationStationId ||
    request.scope.platformId !== review.scope.platformId
  ) {
    return { status: 'not-applicable', review, selectionInstant, blockers: [] };
  }
  const blockers: string[] = [];
  const fromIndex = history.findIndex(
    (version) => version.manifestSha256 === review.from.manifestSha256,
  );
  const toIndex = history.findIndex(
    (version) => version.manifestSha256 === review.to.manifestSha256,
  );
  const from = history[fromIndex];
  const to = history[toIndex];
  if (!selected || selected.manifestSha256 !== review.from.manifestSha256) {
    blockers.push('rollback-from-is-not-current-selection');
  }
  if (!to) {
    blockers.push('rollback-target-is-not-retained');
  } else if (toIndex >= fromIndex) {
    blockers.push('rollback-target-is-not-older');
  }
  if (
    from?.manifest.capture.sha256 !== review.from.snapshotSha256 ||
    to?.manifest.capture.sha256 !== review.to.snapshotSha256
  ) {
    blockers.push('rollback-source-identities-do-not-match');
  }
  if (
    from &&
    Date.parse(review.reviewedAt) < Date.parse(from.record.importInstant)
  ) {
    blockers.push('rollback-review-precedes-current-import');
  }
  if (Date.parse(review.reviewedAt) > Date.parse(selectionInstant)) {
    blockers.push('rollback-review-is-in-the-future');
  }
  return {
    status: blockers.length ? 'rejected' : 'applied',
    review,
    selectionInstant,
    blockers,
  };
}
