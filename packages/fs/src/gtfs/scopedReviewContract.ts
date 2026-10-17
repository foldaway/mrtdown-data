import z from 'zod';
import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';
import {
  ReconciliationEntrySchema,
  type ReconciliationIdentity,
  ReconciliationIdentitySchema,
} from './reconciliation.js';
import type { ScheduleTables } from './schedule.js';
import type { scheduleTopologyProjection } from './topology.js';

type Topology = ReturnType<typeof scheduleTopologyProjection>;
export interface ScopedReviewContext {
  tables: ScheduleTables;
  identity: ReconciliationIdentity;
  topology: Topology;
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const target = ReconciliationEntrySchema.shape.candidates.element;
const fields = {
  providerId: z.string().min(1),
  sourceRecordSha256: digest,
  reason: z.string().min(1),
  target: target.optional(),
};
export const entityDecision = z
  .object({
    ...fields,
    kind: z.enum(['agency', 'route', 'stop']),
    disposition: z.enum(['matched', 'ignored', 'unresolved']),
  })
  .strict();
export const patternDecision = z
  .object({
    ...fields,
    kind: z.literal('pattern'),
    dateSetId: digest,
    disposition: z.enum(['matched', 'excluded', 'unresolved', 'inactive']),
  })
  .strict();
const decision = z
  .union([entityDecision, patternDecision])
  .superRefine((value, context) => {
    if ((value.disposition === 'matched') !== Boolean(value.target))
      context.addIssue({
        code: 'custom',
        message: 'Only matched decisions require a target',
      });
  });
export const ScopedReconciliationDraftSchema = z
  .object({
    schemaVersion: z.literal(2),
    documentKind: z.literal('gtfs-scoped-mapping-draft'),
    identity: ReconciliationIdentitySchema,
    preparedBy: z.string().min(1),
    pilotLineIds: z.array(z.string().min(1)).min(1),
    dateSets: z.array(
      z.object({ id: digest, serviceDates: z.array(z.iso.date()) }).strict(),
    ),
    decisions: z.array(decision),
  })
  .strict();
export type ScopedReconciliationDraft = z.infer<
  typeof ScopedReconciliationDraftSchema
>;
export type ScopedReviewDecision =
  ScopedReconciliationDraft['decisions'][number];
export const ScopedReconciliationApprovalSchema = z
  .object({
    schemaVersion: z.literal(2),
    documentKind: z.literal('gtfs-scoped-mapping-approval'),
    identity: ReconciliationIdentitySchema,
    draftSha256: digest,
    reviewer: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}
export function fingerprint(value: unknown) {
  return hashBytes(Buffer.from(JSON.stringify(normalized(value))));
}
export function key(value: { kind: string; providerId: string }) {
  return `${value.kind}:${value.providerId}`;
}
export function scopedReviewDateSetId(serviceDates: readonly string[]) {
  return fingerprint([...serviceDates].sort(compareStrings));
}
/** Digest binds exact text and decisions, independent of unordered input ordering. */
export function scopedReviewDraftSha256(input: unknown) {
  return scopedReviewDraftFingerprint(
    ScopedReconciliationDraftSchema.parse(input),
  );
}

/** Shared normalization after a version-specific schema has checked the draft. */
export function scopedReviewDraftFingerprint<
  T extends {
    pilotLineIds: string[];
    dateSets: { id: string; serviceDates: string[] }[];
    decisions: unknown[];
  },
>(draft: T) {
  return fingerprint({
    ...draft,
    pilotLineIds: [...draft.pilotLineIds].sort(compareStrings),
    dateSets: draft.dateSets
      .map((set) => ({
        ...set,
        serviceDates: [...set.serviceDates].sort(compareStrings),
      }))
      .sort((a, b) => compareStrings(a.id, b.id)),
    decisions: [...draft.decisions].sort((a, b) =>
      compareStrings(fingerprint(a), fingerprint(b)),
    ),
  });
}
