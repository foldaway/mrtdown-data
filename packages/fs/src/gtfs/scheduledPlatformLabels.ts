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
    'Platform interpretation requires one literal label',
  );

export const ScheduledPlatformLabelPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    corrections: z
      .array(
        z
          .object({
            providerStopId: z.string().min(1),
            stationId: z.string().min(1),
            lineId: z.string().min(1),
            expectedPlatformCode: singleLabel,
            platformCode: singleLabel,
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
    interpretedSourceManifest:
      ReconciliationIdentitySchema.shape.sourceManifest,
  })
  .strict();

const changeSchema = z
  .object({
    providerStopId: z.string(),
    originalRecordSha256: digest,
    interpretedRecordSha256: digest,
    originalPlatformCode: singleLabel,
    platformCode: singleLabel,
    platformId: z.string(),
  })
  .strict();

export const ScheduledPlatformLabelMappingDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-platform-label-mapping-draft'),
    identity: identitySchema,
    policy: ScheduledPlatformLabelPolicySchema,
    changes: z.array(changeSchema),
    dateReview: z.unknown(),
    mapping: ScheduledHolidayMappingDraftSchema,
  })
  .strict();

export const ScheduledPlatformLabelMappingApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-platform-label-mapping-approval'),
    identity: identitySchema,
    draftSha256: digest,
    reviewer: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type ScheduledPlatformLabelMappingDraft = z.infer<
  typeof ScheduledPlatformLabelMappingDraftSchema
>;
export type ScheduledPlatformLabelMappingApproval = z.infer<
  typeof ScheduledPlatformLabelMappingApprovalSchema
>;

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function interpretPlatforms(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
) {
  const policy = ScheduledPlatformLabelPolicySchema.parse(policyInput);
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
  const stops = context.tables['stops.txt'] ?? [];
  const interpreted = stops.map((row) => ({ ...row }));
  const seen = new Set<string>();
  const changes: z.infer<typeof changeSchema>[] = [];
  for (const correction of policy.corrections) {
    if (seen.has(correction.providerStopId)) {
      throw new Error('Duplicate platform interpretation');
    }
    seen.add(correction.providerStopId);
    const matches = stops.flatMap((row, index) =>
      row.stop_id === correction.providerStopId ? [index] : [],
    );
    const index = matches[0];
    const row = index === undefined ? undefined : stops[index];
    if (
      matches.length !== 1 ||
      index === undefined ||
      !row ||
      (row.location_type && row.location_type !== '0') ||
      row.platform_code !== correction.expectedPlatformCode ||
      correction.platformCode === correction.expectedPlatformCode
    ) {
      throw new Error(
        `Missing, changed or non-platform source stop: ${correction.providerStopId}`,
      );
    }
    if (
      !holidayPolicy.families.some(
        (family) => family.lineId === correction.lineId,
      )
    ) {
      throw new Error(
        'Platform interpretation is outside the holiday review families',
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
        'Platform interpretation requires a well-formed source parent',
      );
    }
    const stations = resolveStationCandidates(
      row,
      parents[0],
      context.topology.stations,
    );
    const station = stations[0]?.station;
    const platforms =
      station?.platforms.filter(
        (platform) =>
          platform.lineId === correction.lineId &&
          platform.label === correction.platformCode,
      ) ?? [];
    if (
      stations.length !== 1 ||
      station?.id !== correction.stationId ||
      !station.stationCodes.some(
        (code) =>
          code.lineId === correction.lineId && code.code === row.stop_code,
      ) ||
      platforms.length !== 1
    ) {
      throw new Error(
        'Platform interpretation must retain the uniquely identified station and line',
      );
    }
    const replacement = { ...row, platform_code: correction.platformCode };
    interpreted[index] = replacement;
    changes.push({
      providerStopId: correction.providerStopId,
      originalRecordSha256: fingerprint(row),
      interpretedRecordSha256: fingerprint(replacement),
      originalPlatformCode: correction.expectedPlatformCode,
      platformCode: correction.platformCode,
      platformId: platforms[0].id,
    });
  }
  // Hash an actual derived CSV, rather than claiming the original table bytes changed.
  const columns = [...new Set(stops.flatMap((row) => Object.keys(row)))];
  const csv = `${[
    columns.map(csvCell).join(','),
    ...interpreted.map((row) =>
      columns.map((column) => csvCell(row[column] ?? '')).join(','),
    ),
  ].join('\n')}\n`;
  const sourceManifest = {
    ...context.identity.sourceManifest,
    'stops.txt': hashBytes(Buffer.from(csv)),
  };
  return {
    policy,
    changes,
    context: {
      ...context,
      tables: { ...context.tables, 'stops.txt': interpreted },
      identity: { ...context.identity, sourceManifest },
    },
    holidayPolicy: { ...holidayPolicy, sourceManifest },
    identity: {
      source: context.identity,
      platformPolicySha256: fingerprint(policy),
      holidayPolicySha256: fingerprint(holidayPolicy),
      interpretedSourceManifest: sourceManifest,
    },
  };
}

export function scheduledPlatformLabelMappingDraftSha256(input: unknown) {
  const draft = ScheduledPlatformLabelMappingDraftSchema.parse(input);
  return fingerprint({
    ...draft,
    mapping: scheduledHolidayMappingDraftSha256(draft.mapping),
  });
}

export function createScheduledPlatformLabelMappingDraft(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
) {
  const interpreted = interpretPlatforms(
    context,
    policyInput,
    holidayPolicyInput,
  );
  const dateReview = createScheduledHolidayReviewDraft(
    interpreted.context,
    interpreted.holidayPolicy,
    calendarInput,
  );
  const mapping = createScheduledHolidayMappingDraft(
    interpreted.context,
    interpreted.holidayPolicy,
    calendarInput,
    dateReview,
    {
      preparedBy:
        'MRTDown explicit source-platform interpretation proposal tool',
    },
  );
  const draft = ScheduledPlatformLabelMappingDraftSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-platform-label-mapping-draft',
    identity: interpreted.identity,
    policy: interpreted.policy,
    changes: interpreted.changes,
    dateReview,
    mapping,
  });
  return { ...draft, dateReview };
}

export function evaluateScheduledPlatformLabelMapping(
  context: ScopedReviewContext,
  policyInput: unknown,
  holidayPolicyInput: unknown,
  calendarInput: unknown,
  input: unknown,
  approvalInput?: unknown,
) {
  const interpreted = interpretPlatforms(
    context,
    policyInput,
    holidayPolicyInput,
  );
  const draft = ScheduledPlatformLabelMappingDraftSchema.parse(input);
  const errors: string[] = [];
  if (
    fingerprint(draft.identity) !== fingerprint(interpreted.identity) ||
    fingerprint(draft.policy) !== fingerprint(interpreted.policy) ||
    fingerprint(draft.changes) !== fingerprint(interpreted.changes)
  ) {
    errors.push(
      'Platform interpretation identity, policy or change evidence differs from verified inputs',
    );
  }
  let nestedApproval: ScheduledHolidayMappingApproval | undefined;
  let approvalMatches = false;
  if (approvalInput !== undefined) {
    const approval =
      ScheduledPlatformLabelMappingApprovalSchema.parse(approvalInput);
    approvalMatches =
      fingerprint(approval.identity) === fingerprint(interpreted.identity) &&
      approval.draftSha256 === scheduledPlatformLabelMappingDraftSha256(draft);
    if (!approvalMatches) {
      errors.push('Approval does not bind this platform interpretation draft');
    }
    if (approvalMatches && !errors.length) {
      // The outer approval covers the interpretation too; pass only that verified review to the shared gate.
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
    interpreted.context,
    interpreted.holidayPolicy,
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
