import z from 'zod';
import { hashBytes } from './capture.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import {
  createScheduledHolidayMappingDraft,
  evaluateScheduledHolidayMapping,
  type ScheduledHolidayMappingApproval,
  ScheduledHolidayMappingDraftSchema,
  scheduledHolidayMappingDraftSha256,
} from './scheduledHolidayMapping.js';
import { ScheduledHolidayPolicySchema } from './scheduledHolidayPolicy.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import { resolveStationCandidates } from './stationMatch.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const singleLabel = z
  .string()
  .min(1)
  .refine(
    (label) => label.trim() === label && !label.includes('/'),
    'Platform allocation requires one literal label',
  );

export const ScheduledPlatformAllocationPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    allocations: z
      .array(
        z
          .object({
            providerStopId: z.string().min(1),
            stationId: z.string().min(1),
            lineId: z.string().min(1),
            platformCode: singleLabel,
            serviceIds: z
              .array(z.string().min(1))
              .min(1)
              .refine((ids) => new Set(ids).size === ids.length),
            reason: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const identitySchema = z
  .object({
    source: ReconciliationIdentitySchema,
    platformPolicySha256: digest,
    holidayPolicySha256: digest,
    reviewTopologySha256: digest,
  })
  .strict();

const changeSchema = z
  .object({
    providerStopId: z.string().min(1),
    sourceRecordSha256: digest,
    platformId: z.string().min(1),
    platformCode: singleLabel,
    canonicalServiceIds: z.array(z.string()),
    reviewedServiceIds: z.array(z.string()),
  })
  .strict();

export const ScheduledPlatformAllocationMappingDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-platform-allocation-mapping-draft'),
    identity: identitySchema,
    policy: ScheduledPlatformAllocationPolicySchema,
    changes: z.array(changeSchema),
    dateReview: z.unknown(),
    mapping: ScheduledHolidayMappingDraftSchema,
  })
  .strict();

export const ScheduledPlatformAllocationMappingApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-platform-allocation-mapping-approval'),
    identity: identitySchema,
    draftSha256: digest,
    reviewer: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type ScheduledPlatformAllocationMappingDraft = z.infer<
  typeof ScheduledPlatformAllocationMappingDraftSchema
>;
export type ScheduledPlatformAllocationMappingApproval = z.infer<
  typeof ScheduledPlatformAllocationMappingApprovalSchema
>;

function reviewAllocations(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
) {
  const policy = ScheduledPlatformAllocationPolicySchema.parse(policyInput);
  const holidayPolicy = ScheduledHolidayPolicySchema.parse(holidayPolicyInput);
  if (
    fingerprint(policy.sourceManifest) !==
      fingerprint(context.identity.sourceManifest) ||
    fingerprint(holidayPolicy.sourceManifest) !==
      fingerprint(context.identity.sourceManifest)
  ) {
    throw new Error(
      'Platform and holiday policies must bind the original verified source manifest',
    );
  }
  const topology = structuredClone(context.topology);
  const stops = context.tables['stops.txt'] ?? [];
  const seenStops = new Set<string>();
  const seenPlatforms = new Set<string>();
  const changes: z.infer<typeof changeSchema>[] = [];
  for (const allocation of policy.allocations) {
    if (seenStops.has(allocation.providerStopId)) {
      throw new Error('Duplicate source platform allocation');
    }
    seenStops.add(allocation.providerStopId);
    const rows = stops.filter(
      (row) => row.stop_id === allocation.providerStopId,
    );
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      (row.location_type && row.location_type !== '0') ||
      row.platform_code !== allocation.platformCode
    ) {
      throw new Error(
        `Missing, changed or non-platform source stop: ${allocation.providerStopId}`,
      );
    }
    if (
      !holidayPolicy.families.some(
        (family) => family.lineId === allocation.lineId,
      )
    ) {
      throw new Error(
        'Platform allocation is outside the holiday review families',
      );
    }
    const parents = row.parent_station
      ? stops.filter((stop) => stop.stop_id === row.parent_station)
      : [];
    if (
      row.parent_station &&
      (parents.length !== 1 ||
        parents[0].location_type !== '1' ||
        parents[0].parent_station)
    ) {
      throw new Error(
        'Platform allocation requires a well-formed source parent',
      );
    }
    const stations = resolveStationCandidates(
      row,
      parents[0],
      topology.stations,
    );
    const station = stations[0]?.station;
    const platforms =
      station?.platforms.filter(
        (platform) =>
          platform.lineId === allocation.lineId &&
          platform.label === allocation.platformCode,
      ) ?? [];
    if (
      stations.length !== 1 ||
      station?.id !== allocation.stationId ||
      !station.stationCodes.some(
        (code) =>
          code.lineId === allocation.lineId && code.code === row.stop_code,
      ) ||
      platforms.length !== 1
    ) {
      throw new Error(
        'Platform allocation must retain the uniquely identified literal station, line and platform',
      );
    }
    const platform = platforms[0];
    if (seenPlatforms.has(platform.id)) {
      throw new Error('Multiple source rules for the same physical platform');
    }
    seenPlatforms.add(platform.id);
    if (
      !platform.serviceIds.length ||
      allocation.serviceIds.some(
        (id) =>
          platform.serviceIds.includes(id) ||
          !topology.services.some(
            (service) =>
              service.id === id && service.lineId === allocation.lineId,
          ) ||
          !topology.lines.some(
            (line) =>
              line.id === allocation.lineId && line.serviceIds.includes(id),
          ),
      )
    ) {
      throw new Error(
        'Allocation must add known same-line services to an explicit canonical default',
      );
    }
    const canonicalServiceIds = [...platform.serviceIds];
    platform.serviceIds = [
      ...canonicalServiceIds,
      ...allocation.serviceIds,
    ].sort();
    changes.push({
      providerStopId: allocation.providerStopId,
      sourceRecordSha256: fingerprint(row),
      platformId: platform.id,
      platformCode: allocation.platformCode,
      canonicalServiceIds,
      reviewedServiceIds: [...platform.serviceIds],
    });
  }
  const reviewTopologySha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
  return {
    policy,
    changes,
    context: {
      ...context,
      topology,
      identity: {
        ...context.identity,
        topology: {
          ...context.identity.topology,
          sha256: reviewTopologySha256,
        },
      },
    },
    identity: {
      source: context.identity,
      platformPolicySha256: fingerprint(policy),
      holidayPolicySha256: fingerprint(holidayPolicy),
      reviewTopologySha256,
    },
  };
}

export function scheduledPlatformAllocationMappingDraftSha256(input: unknown) {
  const draft = ScheduledPlatformAllocationMappingDraftSchema.parse(input);
  return fingerprint({
    ...draft,
    mapping: scheduledHolidayMappingDraftSha256(draft.mapping),
  });
}

export function createScheduledPlatformAllocationMappingDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
) {
  const reviewed = reviewAllocations(context, policyInput, holidayPolicyInput);
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
      preparedBy: 'MRTDown explicit source-platform allocation proposal tool',
    },
  );
  const draft = ScheduledPlatformAllocationMappingDraftSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-platform-allocation-mapping-draft',
    identity: reviewed.identity,
    policy: reviewed.policy,
    changes: reviewed.changes,
    dateReview,
    mapping,
  });
  return { ...draft, dateReview };
}

export function evaluateScheduledPlatformAllocationMapping(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
  input: unknown,
  approvalInput?: unknown,
) {
  const reviewed = reviewAllocations(context, policyInput, holidayPolicyInput);
  const draft = ScheduledPlatformAllocationMappingDraftSchema.parse(input);
  const errors: string[] = [];
  if (
    fingerprint(draft.identity) !== fingerprint(reviewed.identity) ||
    fingerprint(draft.policy) !== fingerprint(reviewed.policy) ||
    fingerprint(draft.changes) !== fingerprint(reviewed.changes)
  ) {
    errors.push(
      'Platform allocation identity, policy or change evidence differs from verified inputs',
    );
  }
  let nestedApproval: ScheduledHolidayMappingApproval | undefined;
  let approvalMatches = false;
  if (approvalInput !== undefined) {
    const approval =
      ScheduledPlatformAllocationMappingApprovalSchema.parse(approvalInput);
    approvalMatches =
      fingerprint(approval.identity) === fingerprint(reviewed.identity) &&
      approval.draftSha256 ===
        scheduledPlatformAllocationMappingDraftSha256(draft);
    if (!approvalMatches) {
      errors.push('Approval does not bind this platform allocation draft');
    }
    if (approvalMatches && !errors.length) {
      // The outer approval covers source precedence too; pass only that verified review to the shared gate.
      nestedApproval = {
        schemaVersion: 1,
        documentKind: 'gtfs-holiday-mapping-approval',
        identity: draft.mapping.identity,
        draftSha256: scheduledHolidayMappingDraftSha256(draft.mapping),
        reviewer: approval.reviewer,
        reason: approval.reason,
      };
    }
  }
  const result = evaluateScheduledHolidayMapping(
    reviewed.context,
    holidayPolicyInput,
    calendarInput,
    draft.dateReview,
    draft.mapping,
    nestedApproval,
  );
  const valid = result.valid && errors.length === 0;
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
