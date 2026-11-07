import z from 'zod';
import {
  GroupedScopedReconciliationDraftSchema,
  groupedScopedReviewDraftSha256,
} from './groupedReviewContract.js';
import {
  evaluateGroupedScopedDates,
  evaluateGroupedScopedReconciliation,
} from './scopedReview.js';
import {
  type ScopedReviewContext,
  scopedReviewDateSetId,
} from './scopedReviewContract.js';
import { SharedServiceTargetSchema } from './sharedServiceTarget.js';

export const ScheduledSharedServiceMembershipClaimsSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-shared-service-membership-claims'),
    baseDraftSha256: z.string().regex(/^[a-f0-9]{64}$/),
    claims: z
      .array(
        z
          .object({
            providerPatternId: z.string().min(1),
            serviceDates: z
              .array(z.iso.date())
              .min(1)
              .refine(
                (dates) => new Set(dates).size === dates.length,
                'Claim dates must be distinct',
              ),
            target: SharedServiceTargetSchema,
            reason: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/** Internal: bind claim shape and dates; the owning review must validate service and platform semantics. */
export function prepareSharedServiceMembershipClaims(
  draftInput: unknown,
  claimsInput: unknown,
) {
  const draft = GroupedScopedReconciliationDraftSchema.parse(draftInput);
  const claims =
    ScheduledSharedServiceMembershipClaimsSchema.parse(claimsInput);
  if (claims.baseDraftSha256 !== groupedScopedReviewDraftSha256(draft))
    throw new Error(
      'Shared service claims do not bind this base mapping draft',
    );
  const dateSets = new Map(
    draft.dateSets.map((set) => [set.id, set.serviceDates]),
  );
  const seen = new Set<string>();
  for (const claim of claims.claims) {
    const remaining = new Set(claim.serviceDates);
    for (const date of claim.serviceDates) {
      const key = JSON.stringify([claim.providerPatternId, date]);
      if (seen.has(key)) throw new Error('Overlapping shared service claims');
      seen.add(key);
    }
    const dateSet = (dates: string[]) => {
      const sorted = [...dates].sort();
      const id = scopedReviewDateSetId(sorted);
      dateSets.set(id, sorted);
      return id;
    };
    draft.decisions = draft.decisions.flatMap((decision) => {
      if (
        decision.kind !== 'pattern' ||
        decision.providerId !== claim.providerPatternId
      )
        return [decision];
      const dates = dateSets.get(decision.dateSetId);
      if (!dates) throw new Error('Missing base mapping date set');
      const selected = dates.filter((date) => remaining.has(date));
      if (!selected.length) return [decision];
      if (decision.disposition !== 'unresolved')
        throw new Error(
          'Shared service claims can only resolve unresolved dates',
        );
      for (const date of selected) remaining.delete(date);
      const rest = dates.filter((date) => !selected.includes(date));
      return [
        ...(rest.length ? [{ ...decision, dateSetId: dateSet(rest) }] : []),
        {
          ...decision,
          dateSetId: dateSet(selected),
          disposition: 'matched' as const,
          target: claim.target,
          reason: claim.reason,
        },
      ];
    });
    if (remaining.size)
      throw new Error(
        'Shared service claim has unknown or uncovered pattern dates',
      );
  }
  const used = new Set(
    draft.decisions.flatMap((decision) =>
      decision.kind === 'pattern' ? [decision.dateSetId] : [],
    ),
  );
  draft.dateSets = [...dateSets]
    .filter(([id]) => used.has(id))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, serviceDates]) => ({ id, serviceDates }));
  return draft;
}

/** Standalone mappings retain their strict canonical, date and complete-platform checks. */
function applyMemberships(
  context: ScopedReviewContext,
  draftInput: unknown,
  claimsInput: unknown,
  patternServiceDates?: ReadonlyMap<string, string[]>,
) {
  const draft = prepareSharedServiceMembershipClaims(draftInput, claimsInput);
  const evaluated = patternServiceDates
    ? evaluateGroupedScopedDates(context, draft, patternServiceDates, {
        matches: false,
        errors: [],
      })
    : evaluateGroupedScopedReconciliation(context, draft);
  if (!evaluated.valid)
    throw new Error(
      `Invalid shared service memberships: ${evaluated.errors.join('; ')}`,
    );
  return draft;
}

/** Adopt explicit claims against literal source dates. */
export function applyScheduledSharedServiceMemberships(
  context: ScopedReviewContext,
  draftInput: unknown,
  claimsInput: unknown,
) {
  return applyMemberships(context, draftInput, claimsInput);
}

/** Internal: only an owning contract may supply its independently verified date population. */
export function applySharedServiceMembershipsForDates(
  context: ScopedReviewContext,
  draftInput: unknown,
  claimsInput: unknown,
  patternServiceDates: ReadonlyMap<string, string[]>,
) {
  return applyMemberships(
    context,
    draftInput,
    claimsInput,
    patternServiceDates,
  );
}
