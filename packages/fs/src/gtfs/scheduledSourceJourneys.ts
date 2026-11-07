import { ScheduledStopTimeSchema } from '@mrtdown/core';
import z from 'zod';
import { hashBytes } from './capture.js';
import { compareStopSequences } from './order.js';
import {
  proposeScheduleReconciliation,
  ReconciliationIdentitySchema,
} from './reconciliation.js';
import { auditSchedule } from './schedule.js';
import {
  createScheduledHolidayMappingDraft,
  evaluateScheduledHolidayMapping,
  type ScheduledHolidayMappingApproval,
  ScheduledHolidayMappingDraftSchema,
  scheduledHolidayMappingDraftSha256,
} from './scheduledHolidayMapping.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import {
  reviewScheduledPlatformAllocations,
  ScheduledPlatformAllocationMappingDraftSchema,
} from './scheduledPlatformAllocations.js';
import { scheduledStopTimeFromGtfs } from './scheduledStopTime.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import { applySharedServiceMembershipsForDates } from './sharedServiceMemberships.js';
import { resolveStationCandidates } from './stationMatch.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const journeyRule = z
  .object({
    providerPatternId: digest,
    lineId: z.string().min(1),
    serviceId: z.string().min(1),
    serviceDates: z
      .array(z.iso.date())
      .min(1)
      .refine(
        (dates) => new Set(dates).size === dates.length,
        'Duplicate journey service date',
      ),
    reason: z.string().min(1),
  })
  .strict();

/** A timed passenger call, preserving the entire literal physical-platform set. */
export const ScheduledSourceJourneyCallSchema =
  ScheduledStopTimeSchema.safeExtend({
    index: z.number().int().nonnegative(),
    stationId: z.string().min(1),
    literalPlatformCode: z.string(),
    platformIds: z
      .array(z.string().min(1))
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Duplicate physical platform',
      ),
    passengerService: z.literal(true),
  }).superRefine((call, context) => {
    if (call.arrivalSeconds === null && call.departureSeconds === null)
      context.addIssue({
        code: 'custom',
        message: 'Passenger-call assumption requires a supplied station timing',
      });
  });
export type ScheduledSourceJourneyCall = z.infer<
  typeof ScheduledSourceJourneyCallSchema
>;
const sourceRow = z.record(z.string(), z.string());
export const ScheduledSourceJourneyEvidenceSchema = journeyRule.extend({
  sourceRecordSha256: digest,
  pathBasis: z.literal('supplied-source-order'),
  trips: z
    .array(
      z
        .object({
          sourceTrip: sourceRow,
          sourceStopTimes: z.array(sourceRow).min(2),
          calls: z.array(ScheduledSourceJourneyCallSchema).min(2),
        })
        .strict(),
    )
    .min(1),
});
export type ScheduledSourceJourneyEvidence = z.infer<
  typeof ScheduledSourceJourneyEvidenceSchema
>;
export const ScheduledSourceJourneyPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    passengerCallRule: z.literal('timed-source-occurrences'),
    journeys: z.array(journeyRule).min(1),
  })
  .strict();
export type ScheduledSourceJourneyPolicy = z.infer<
  typeof ScheduledSourceJourneyPolicySchema
>;

const identity = z
  .object({
    source: ReconciliationIdentitySchema,
    platformPolicySha256: digest,
    holidayPolicySha256: digest,
    sourceJourneyPolicySha256: digest,
    reviewTopologySha256: digest,
  })
  .strict();
export const ScheduledSourceJourneyMappingDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-source-journey-mapping-draft'),
    identity,
    policy: ScheduledSourceJourneyPolicySchema,
    platformChanges:
      ScheduledPlatformAllocationMappingDraftSchema.shape.changes,
    journeys: z.array(ScheduledSourceJourneyEvidenceSchema).min(1),
    dateReview: z.unknown(),
    mapping: ScheduledHolidayMappingDraftSchema,
  })
  .strict();
export const ScheduledSourceJourneyMappingApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-source-journey-mapping-approval'),
    identity,
    draftSha256: digest,
    reviewer: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();
export type ScheduledSourceJourneyMappingApproval = z.infer<
  typeof ScheduledSourceJourneyMappingApprovalSchema
>;
export type ScheduledSourceJourneyMappingDraft = z.infer<
  typeof ScheduledSourceJourneyMappingDraftSchema
>;

/** Internal: verify source-order rules and original calls before composing a separately bound topology. */
export function reviewScheduledSourceJourneys(
  context: ScopedReviewContext,
  policyInput: unknown,
  platformPolicyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
) {
  if (context.sourceJourneyRules?.length)
    throw new Error('Source journey review requires the original context');
  const policy = ScheduledSourceJourneyPolicySchema.parse(policyInput);
  if (
    fingerprint(policy.sourceManifest) !==
    fingerprint(context.identity.sourceManifest)
  ) {
    throw new Error(
      'Source journey policy must bind the original source manifest',
    );
  }
  const allocated = reviewScheduledPlatformAllocations(
    context,
    platformPolicyInput,
    holidayPolicyInput,
  );
  const population = resolveScheduledHolidayDates(
    context,
    holidayPolicyInput,
    calendarInput,
  );
  const base = proposeScheduleReconciliation(
    context.tables,
    context.identity,
    context.topology,
  );
  const audit = auditSchedule(context.tables);
  const stops = new Map(
    context.tables['stops.txt'].map((row) => [row.stop_id, row]),
  );
  const rowsByTrip = new Map<string, (typeof context.tables)[string]>();
  for (const row of context.tables['stop_times.txt']) {
    const rows = rowsByTrip.get(row.trip_id) ?? [];
    rows.push(row);
    rowsByTrip.set(row.trip_id, rows);
  }
  const seen = new Set<string>();
  const journeys = policy.journeys.map((rule) => {
    if (seen.has(rule.providerPatternId))
      throw new Error('Duplicate source journey pattern');
    seen.add(rule.providerPatternId);
    const pattern = audit.patterns.find((p) => p.id === rule.providerPatternId);
    const effective = population.patterns.find(
      (p) => p.providerPatternId === rule.providerPatternId,
    );
    const original = base.entries.find(
      (e) => e.kind === 'pattern' && e.providerId === rule.providerPatternId,
    );
    if (
      !pattern ||
      !effective ||
      effective.lineId !== rule.lineId ||
      !original
    ) {
      throw new Error('Unknown source journey pattern or wrong line');
    }
    if (original.candidates.length)
      throw new Error(
        'Source journey policy cannot replace existing ordered path candidates',
      );
    const service = context.topology.services.find(
      (s) => s.id === rule.serviceId && s.lineId === rule.lineId,
    );
    if (
      !service ||
      !context.topology.lines.some(
        (l) => l.id === rule.lineId && l.serviceIds.includes(service.id),
      )
    ) {
      throw new Error(
        'Source journey requires a known same-line service association',
      );
    }
    if (
      rule.serviceDates.some((date) => !effective.serviceDates.includes(date))
    ) {
      throw new Error(
        'Source journey dates must belong to the effective population',
      );
    }
    const occurrences = pattern.stopIds.map((stopId, index) => {
      const row = stops.get(stopId);
      if (!row) throw new Error('Missing source journey stop');
      const matches = resolveStationCandidates(
        row,
        stops.get(row.parent_station),
        context.topology.stations,
      );
      const station = matches[0]?.station;
      if (matches.length !== 1 || !station)
        throw new Error('Source journey requires unique station identities');
      const candidates =
        base.entries.find((e) => e.kind === 'stop' && e.providerId === stopId)
          ?.candidates ?? [];
      return {
        index,
        providerStopId: stopId,
        stationId: station.id,
        literalPlatformCode: row.platform_code ?? '',
        platformIds: candidates
          .filter((c) => c.kind === 'platform')
          .map((c) => c.id)
          .sort(),
      };
    });
    if (
      !service.revisions.some((r) =>
        occurrences.every((o) =>
          r.stations.some(
            (s) =>
              s.stationId === o.stationId &&
              s.displayCode === stops.get(o.providerStopId)?.stop_code,
          ),
        ),
      )
    ) {
      throw new Error(
        'Source journey has no service revision containing all supplied station codes',
      );
    }
    const trips = pattern.tripIds.map((tripId) => {
      const trip = context.tables['trips.txt'].find(
        (t) => t.trip_id === tripId,
      );
      if (!trip) throw new Error('Missing source journey trip');
      const stopTimes = (rowsByTrip.get(tripId) ?? [])
        .map((row) => ({ ...row }))
        .sort((a, b) => compareStopSequences(a.stop_sequence, b.stop_sequence));
      const calls = stopTimes.map((row, index) => {
        const time = scheduledStopTimeFromGtfs(row);
        if (time.arrivalSeconds === null && time.departureSeconds === null) {
          throw new Error(
            'Passenger-call assumption requires a supplied station timing',
          );
        }
        return {
          ...occurrences[index],
          ...time,
          passengerService: true as const,
        };
      });
      return { sourceTrip: { ...trip }, sourceStopTimes: stopTimes, calls };
    });
    return {
      ...rule,
      sourceRecordSha256: original.sourceRecordSha256,
      trips,
      // This is an association, not an assertion of contiguous canonical travel.
      pathBasis: 'supplied-source-order' as const,
    };
  });
  const topology = {
    ...allocated.context.topology,
    sourceJourneyRules: policy.journeys,
  };
  const reviewTopologySha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
  return {
    policy,
    journeys,
    platformChanges: allocated.changes,
    context: {
      ...allocated.context,
      topology,
      sourceJourneyRules: policy.journeys,
      identity: {
        ...allocated.context.identity,
        topology: {
          ...allocated.context.identity.topology,
          sha256: reviewTopologySha256,
        },
      },
    },
    identity: {
      ...allocated.identity,
      reviewTopologySha256,
      sourceJourneyPolicySha256: fingerprint(policy),
    },
  };
}

export function scheduledSourceJourneyMappingDraftSha256(input: unknown) {
  const draft = ScheduledSourceJourneyMappingDraftSchema.parse(input);
  return fingerprint({
    ...draft,
    mapping: scheduledHolidayMappingDraftSha256(draft.mapping),
  });
}

/** Explicit source-order and passenger-call assumptions; never repair canonical or source data. */
export function createScheduledSourceJourneyMappingDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  platformPolicyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
) {
  const reviewed = reviewScheduledSourceJourneys(
    context,
    policyInput,
    platformPolicyInput,
    holidayPolicyInput,
    calendarInput,
  );
  const dateReview = createScheduledHolidayReviewDraft(
    reviewed.context,
    holidayPolicyInput,
    calendarInput,
  );
  const mapping = createScheduledHolidayMappingDraft(
    reviewed.context,
    holidayPolicyInput,
    calendarInput,
    dateReview,
    {
      preparedBy: 'MRTDown explicit source-journey proposal tool',
    },
  );
  return {
    ...ScheduledSourceJourneyMappingDraftSchema.parse({
      schemaVersion: 1,
      documentKind: 'gtfs-source-journey-mapping-draft',
      identity: reviewed.identity,
      policy: reviewed.policy,
      platformChanges: reviewed.platformChanges,
      journeys: reviewed.journeys,
      dateReview,
      mapping,
    }),
    dateReview,
    journeys: reviewed.journeys,
    platformChanges: reviewed.platformChanges,
  };
}

/** Add explicit shared memberships without narrowing the complete effective date population. */
export function applyScheduledSourceJourneyServiceMemberships(
  context: ScopedReviewContext,
  policyInput: unknown,
  platformPolicyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
  input: unknown,
  claimsInput: unknown,
) {
  const reviewed = reviewScheduledSourceJourneys(
    context,
    policyInput,
    platformPolicyInput,
    holidayPolicyInput,
    calendarInput,
  );
  const draft = ScheduledSourceJourneyMappingDraftSchema.parse(input);
  const existing = evaluateScheduledSourceJourneyMapping(
    context,
    policyInput,
    platformPolicyInput,
    holidayPolicyInput,
    calendarInput,
    draft,
  );
  if (!existing.valid)
    throw new Error(
      `Invalid base source journey mapping: ${existing.errors.join('; ')}`,
    );
  const mapping = applySharedServiceMembershipsForDates(
    reviewed.context,
    draft.mapping.mapping,
    claimsInput,
    new Map(
      resolveScheduledHolidayDates(
        reviewed.context,
        holidayPolicyInput,
        calendarInput,
      ).patterns.map((pattern) => [
        pattern.providerPatternId,
        pattern.serviceDates,
      ]),
    ),
  );
  return { ...draft, mapping: { ...draft.mapping, mapping } };
}

export function evaluateScheduledSourceJourneyMapping(
  context: ScopedReviewContext,
  policyInput: unknown,
  platformPolicyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
  input: unknown,
  approvalInput?: unknown,
) {
  const reviewed = reviewScheduledSourceJourneys(
    context,
    policyInput,
    platformPolicyInput,
    holidayPolicyInput,
    calendarInput,
  );
  const draft = ScheduledSourceJourneyMappingDraftSchema.parse(input);
  const errors: string[] = [];
  if (
    fingerprint(draft.identity) !== fingerprint(reviewed.identity) ||
    fingerprint(draft.policy) !== fingerprint(reviewed.policy) ||
    fingerprint(draft.journeys) !== fingerprint(reviewed.journeys) ||
    fingerprint(draft.platformChanges) !== fingerprint(reviewed.platformChanges)
  ) {
    errors.push(
      'Source journey identity, policy or occurrence evidence differs from verified inputs',
    );
  }
  let approvalMatches = false;
  let nestedApproval: ScheduledHolidayMappingApproval | undefined;
  if (approvalInput !== undefined) {
    const approval =
      ScheduledSourceJourneyMappingApprovalSchema.parse(approvalInput);
    approvalMatches =
      fingerprint(approval.identity) === fingerprint(reviewed.identity) &&
      approval.draftSha256 === scheduledSourceJourneyMappingDraftSha256(draft);
    if (!approvalMatches)
      errors.push('Approval does not bind this source journey draft');
    if (approvalMatches && !errors.length)
      nestedApproval = {
        schemaVersion: 1,
        documentKind: 'gtfs-holiday-mapping-approval',
        identity: draft.mapping.identity,
        draftSha256: scheduledHolidayMappingDraftSha256(draft.mapping),
        reviewer: approval.reviewer,
        reason: approval.reason,
      };
  }
  const result = evaluateScheduledHolidayMapping(
    reviewed.context,
    holidayPolicyInput,
    calendarInput,
    draft.dateReview,
    draft.mapping,
    nestedApproval,
  );
  const valid = result.valid && !errors.length;
  return {
    ...result,
    valid,
    errors: [...new Set([...result.errors, ...errors])].sort(),
    readiness: valid ? result.readiness : ('invalid' as const),
    approvalMatches,
    reviewComplete: valid && result.reviewComplete,
    mappingReviewEligible: valid && result.mappingReviewEligible,
    generationEligible: false as const,
  };
}
