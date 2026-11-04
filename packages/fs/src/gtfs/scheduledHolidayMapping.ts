import z from 'zod';
import {
  GroupedScopedReconciliationDraftSchema,
  groupedScopedReviewDraftSha256,
} from './groupedReviewContract.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import { verifyScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import { evaluateGroupedScopedDates } from './scopedReview.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import { createGroupedScopedDraftForDates } from './scopedReviewDraft.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identitySchema = z
  .object({
    source: ReconciliationIdentitySchema,
    policySha256: digest,
    datePopulationSha256: digest,
    holidayReviewDraftSha256: digest,
  })
  .strict();

export const ScheduledHolidayMappingDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-holiday-mapping-draft'),
    identity: identitySchema,
    mapping: GroupedScopedReconciliationDraftSchema,
  })
  .strict();

export const ScheduledHolidayMappingApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-holiday-mapping-approval'),
    identity: identitySchema,
    draftSha256: digest,
    reviewer: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type ScheduledHolidayMappingDraft = z.infer<
  typeof ScheduledHolidayMappingDraftSchema
>;
export type ScheduledHolidayMappingApproval = z.infer<
  typeof ScheduledHolidayMappingApprovalSchema
>;

export function scheduledHolidayMappingDraftSha256(input: unknown) {
  const draft = ScheduledHolidayMappingDraftSchema.parse(input);
  return fingerprint({
    ...draft,
    mapping: groupedScopedReviewDraftSha256(draft.mapping),
  });
}

function verifiedPopulation(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayCalendarInput: unknown,
  reviewInput: unknown,
) {
  const review = verifyScheduledHolidayReviewDraft(
    context,
    policyInput,
    holidayCalendarInput,
    reviewInput,
  );
  const resolved = resolveScheduledHolidayDates(
    context,
    policyInput,
    holidayCalendarInput,
  );
  if (!resolved.policy || !resolved.policySha256) {
    throw new Error('Holiday mapping requires an explicit policy');
  }
  return {
    identity: {
      source: context.identity,
      policySha256: resolved.policySha256,
      datePopulationSha256: resolved.datePopulationSha256,
      holidayReviewDraftSha256: review.draftSha256,
    },
    pilotLineIds: [
      ...new Set(resolved.policy.families.map((family) => family.lineId)),
    ].sort(),
    dates: new Map(
      resolved.patterns.map((pattern) => [
        pattern.providerPatternId,
        pattern.serviceDates,
      ]),
    ),
  };
}

/** Prepare editable mapping proposals against a verified holiday-date review; never create approval. */
export function createScheduledHolidayMappingDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayCalendarInput: unknown,
  reviewInput: unknown,
  options: { preparedBy: string },
): ScheduledHolidayMappingDraft {
  const population = verifiedPopulation(
    context,
    policyInput,
    holidayCalendarInput,
    reviewInput,
  );
  return ScheduledHolidayMappingDraftSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-holiday-mapping-draft',
    identity: population.identity,
    mapping: createGroupedScopedDraftForDates(
      context,
      {
        pilotLineIds: population.pilotLineIds,
        preparedBy: options.preparedBy,
      },
      population.dates,
    ),
  });
}

/** Approval is repository-review metadata, not authentication or permission to generate a timetable. */
export function evaluateScheduledHolidayMapping(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayCalendarInput: unknown,
  reviewInput: unknown,
  input: unknown,
  approvalInput?: unknown,
) {
  const population = verifiedPopulation(
    context,
    policyInput,
    holidayCalendarInput,
    reviewInput,
  );
  const draft = ScheduledHolidayMappingDraftSchema.parse(input);
  const errors: string[] = [];
  if (fingerprint(draft.identity) !== fingerprint(population.identity)) {
    errors.push(
      'Holiday mapping identity differs from verified policy, dates or review draft',
    );
  }
  if (
    fingerprint([...draft.mapping.pilotLineIds].sort()) !==
    fingerprint(population.pilotLineIds)
  ) {
    errors.push(
      'Holiday mapping pilot differs from explicitly bound policy families',
    );
  }
  for (const decision of draft.mapping.decisions) {
    if (
      decision.disposition === 'ignored' ||
      decision.disposition === 'excluded'
    ) {
      errors.push(
        'Holiday mapping cannot ignore or exclude source records; unresolved evidence must remain unresolved',
      );
    }
  }
  let approvalMatches = false;
  if (approvalInput !== undefined) {
    const approval = ScheduledHolidayMappingApprovalSchema.parse(approvalInput);
    approvalMatches =
      approval.draftSha256 === scheduledHolidayMappingDraftSha256(draft) &&
      fingerprint(approval.identity) === fingerprint(population.identity);
    if (!approvalMatches) {
      errors.push(
        'Approval does not bind this holiday mapping draft and input identity',
      );
    }
  }
  return evaluateGroupedScopedDates(context, draft.mapping, population.dates, {
    matches: approvalMatches,
    errors,
  });
}
