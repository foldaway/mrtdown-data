import z from 'zod';
import { singaporeCaptureDate } from './capture.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import {
  buildScheduledPlatformAssociationReview,
  type ScheduledPlatformAssociationInputs,
  ScheduledPlatformAssociationPolicySchema,
} from './scheduledPlatformAssociations.js';
import { ScheduledSourceJourneyPolicySchema } from './scheduledSourceJourneys.js';
import { fingerprint } from './scopedReviewContract.js';
import { ScheduledSharedServiceMembershipClaimsSchema } from './sharedServiceMemberships.js';

/** Maintainer-supported operations, separate from raw calendars, source order and release embargo. */
export const ScheduledServiceDateApplicabilityPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    captureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    dateBasis: z.literal('service-date'),
    timezone: z.literal('Asia/Singapore'),
    captureServiceDate: z.iso.date().optional(),
    serviceDateRange:
      ScheduledPlatformAssociationPolicySchema.shape.serviceDateRange,
    basis: z.string().min(1),
  })
  .strict();

export interface ScheduledCombinedReviewInputs
  extends Omit<ScheduledPlatformAssociationInputs, 'policy'> {
  applicabilityPolicy: unknown;
  /** Retrieval timestamp from the verified receipt for capture-scoped revisions. */
  captureRetrievedAt?: string;
  associationPolicy: unknown;
  sourceJourneyPolicy: unknown;
  sharedServiceMemberships?: unknown;
}

/** Reconstruct all policies together; outside dates remain source diagnostics, never exclusions. */
export function createScheduledCombinedReview(
  inputs: ScheduledCombinedReviewInputs,
) {
  const applicability = ScheduledServiceDateApplicabilityPolicySchema.parse(
    inputs.applicabilityPolicy,
  );
  const { captureServiceDate } = applicability;
  if (
    captureServiceDate !== undefined &&
    (inputs.captureRetrievedAt === undefined ||
      singaporeCaptureDate(inputs.captureRetrievedAt) !== captureServiceDate)
  ) {
    throw new Error(
      'Combined review capture service date must match the verified receipt in Singapore time',
    );
  }
  const association = ScheduledPlatformAssociationPolicySchema.parse(
    inputs.associationPolicy,
  );
  const journeys = ScheduledSourceJourneyPolicySchema.parse(
    inputs.sourceJourneyPolicy,
  );
  const memberships =
    inputs.sharedServiceMemberships === undefined
      ? null
      : ScheduledSharedServiceMembershipClaimsSchema.parse(
          inputs.sharedServiceMemberships,
        );
  if (
    applicability.captureSha256 !== inputs.captureSha256 ||
    fingerprint(applicability.sourceManifest) !==
      fingerprint(inputs.context.identity.sourceManifest) ||
    fingerprint(applicability.serviceDateRange) !==
      fingerprint(association.serviceDateRange)
  ) {
    throw new Error(
      'Combined review requires capture-bound applicability and identical association bounds',
    );
  }
  const supported = (date: string) =>
    date >= applicability.serviceDateRange.startDate &&
    date < applicability.serviceDateRange.endDateExclusive;
  if (
    journeys.journeys.some((rule) =>
      rule.serviceDates.some((date) => !supported(date)),
    ) ||
    memberships?.claims.some((claim) =>
      claim.serviceDates.some((date) => !supported(date)),
    )
  ) {
    throw new Error(
      'Combined journey and membership claims must stay inside supported applicability',
    );
  }
  const { review, sourceJourneyReview } =
    buildScheduledPlatformAssociationReview(
      { ...inputs, policy: association },
      {
        sourceJourneyPolicy: journeys,
        sharedServiceMemberships: memberships ?? undefined,
        captureServiceDate,
      },
    );
  if (!sourceJourneyReview || !review.accounting.supportedTripDateCount) {
    throw new Error(
      'Combined review requires source journeys and a nonempty supported population',
    );
  }
  for (const pattern of review.patterns) {
    const claimed = pattern.reviewCells
      .flatMap((cell) => cell.serviceDates)
      .sort();
    if (
      fingerprint(claimed) !==
        fingerprint([...pattern.supportedServiceDates].sort()) ||
      new Set([
        ...pattern.supportedServiceDates,
        ...pattern.outsideServiceDates,
      ]).size !== pattern.serviceDates.length
    ) {
      throw new Error(
        'Combined review must account for every effective date exactly once',
      );
    }
  }
  const unresolvedEntities = review.entities.filter(
    (entity) => entity.disposition === 'unresolved',
  ).length;
  const draft = {
    schemaVersion: 1,
    documentKind: 'gtfs-combined-schedule-review-draft',
    identity: {
      ...review.identity,
      applicabilityPolicySha256: fingerprint(applicability),
      sourceJourneyPolicySha256: fingerprint(journeys),
      sharedServiceMembershipsSha256: fingerprint(memberships),
      datePopulationSha256: fingerprint(
        review.patterns.map((pattern) => ({
          providerPatternId: pattern.providerPatternId,
          sourceServiceDates: pattern.sourceServiceDates,
          serviceDates: pattern.serviceDates,
          supportedServiceDates: pattern.supportedServiceDates,
          outsideServiceDates: pattern.outsideServiceDates,
        })),
      ),
    },
    applicabilityPolicy: applicability,
    sourceJourneyPolicy: journeys,
    sharedServiceMemberships: memberships,
    sourceJourneyReview,
    associationReview: review,
    accounting: review.accounting,
    unresolvedEntities,
    coverageComplete: true,
    readiness:
      review.accounting.unresolvedTripDateCount || unresolvedEntities
        ? 'unresolved'
        : 'unapproved',
    approvalMatches: false,
    mappingReviewEligible: false,
    generationEligible: false,
  } as const;
  return { ...draft, draftSha256: fingerprint(draft) };
}

/** Saved reviews cannot edit away a date, member, access restriction or unresolved result. */
export function verifyScheduledCombinedReview(
  inputs: ScheduledCombinedReviewInputs,
  input: unknown,
) {
  const expected = createScheduledCombinedReview(inputs);
  if (fingerprint(input) !== fingerprint(expected)) {
    throw new Error(
      'Combined review is stale or differs from verified policies, applicability or evidence',
    );
  }
  return {
    valid: true as const,
    draftSha256: expected.draftSha256,
    coverageComplete: expected.coverageComplete,
    readiness: expected.readiness,
    mappingReviewEligible: false as const,
    generationEligible: false as const,
  };
}

export type ScheduledCombinedReview = ReturnType<
  typeof createScheduledCombinedReview
>;
