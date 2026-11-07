import {
  ScheduledServiceMembershipSchema,
  ScheduledStopTimeSchema,
} from '@mrtdown/core';
import z from 'zod';
import { compareStrings } from './order.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import {
  createScheduledCombinedReview,
  type ScheduledCombinedReview,
  type ScheduledCombinedReviewInputs,
  ScheduledServiceDateApplicabilityPolicySchema,
} from './scheduledCombinedReview.js';
import { scheduledPlatformAssociationAccess } from './scheduledPlatformAssociations.js';
import { ScheduledRouteMappingSchema } from './scheduledTripRoute.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';
import { sameTarget } from './scopedReviewContext.js';
import { fingerprint } from './scopedReviewContract.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reviewIdentity = z
  .object({
    source: ReconciliationIdentitySchema,
    captureSha256: digest,
    policySha256: digest,
    allocationPolicySha256: digest,
    holidayPolicySha256: digest.nullable(),
    reviewTopologySha256: digest,
    supportedDatePopulationSha256: digest,
    applicabilityPolicySha256: digest,
    sourceJourneyPolicySha256: digest,
    sharedServiceMembershipsSha256: digest,
    datePopulationSha256: digest,
  })
  .strict();
const reviewText = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

/** Approval metadata for the exact combined report; never source admission or release authorization. */
export const ScheduledCombinedMappingApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-combined-mapping-approval'),
    identity: reviewIdentity,
    draftSha256: digest,
    reviewer: reviewText,
    reason: reviewText,
  })
  .strict();
export type ScheduledCombinedMappingApproval = z.infer<
  typeof ScheduledCombinedMappingApprovalSchema
>;

const call = ScheduledStopTimeSchema.safeExtend({
  index: z.number().int().nonnegative(),
  stationId: z.string().min(1),
  platformSemantics: z.enum([
    'distinct-platform-associations',
    'complete-source-alternatives',
  ]),
  platforms: z
    .array(
      z
        .object({
          platformId: z.string().min(1),
          boardingStatus: z
            .enum(['not_in_service', 'alighting_only'])
            .nullable(),
          accessByService: z
            .array(
              ScheduledServiceMembershipSchema.extend({
                serviceScope: z.enum(['listed', 'excluded', 'unspecified']),
                passengerBoardingEligible: z.boolean(),
                passengerAlightingEligible: z.boolean(),
              }).strict(),
            )
            .min(1),
        })
        .strict(),
    )
    .min(1),
});
export const ScheduledCombinedTripAssignmentSchema = z
  .object({
    providerPatternId: digest,
    providerTripId: z.string().min(1),
    providerRouteId: z.string().min(1),
    providerCalendarId: z.string().min(1),
    serviceDates: z
      .array(z.iso.date())
      .min(1)
      .refine((dates) => new Set(dates).size === dates.length)
      .transform((dates) => [...dates].sort()),
    lineId: z.string().min(1),
    serviceMemberships: z
      .array(ScheduledServiceMembershipSchema)
      .min(1)
      .refine(
        (members) =>
          new Set(members.map((member) => member.serviceId)).size ===
          members.length,
      )
      .transform((members) =>
        [...members].sort((a, b) => compareStrings(a.serviceId, b.serviceId)),
      ),
    destinationStationId: z.string().min(1),
    pathBasis: z.enum(['canonical-ordered-path', 'supplied-source-order']),
    routeMapping: ScheduledRouteMappingSchema,
    calls: z.array(call).min(2),
  })
  .strict();
export type ScheduledCombinedTripAssignment = z.infer<
  typeof ScheduledCombinedTripAssignmentSchema
>;

const coverage = z
  .object({
    sourceTripCount: z.number().int().nonnegative(),
    assignedTripCount: z.number().int().nonnegative(),
    literalTripDateCount: z.number().int().nonnegative(),
    effectiveTripDateCount: z.number().int().nonnegative(),
    supportedTripDateCount: z.number().int().nonnegative(),
    outsideTripDateCount: z.number().int().nonnegative(),
    assignedTripDateCount: z.number().int().nonnegative(),
    unassignedTripDateCount: z.number().int().nonnegative(),
    excludedTripDateCount: z.literal(0),
    tripDateCoverageComplete: z.boolean(),
    gaps: z.array(
      z
        .object({
          providerPatternId: digest,
          providerTripIds: z.array(z.string().min(1)).min(1),
          serviceDates: z.array(z.iso.date()).min(1),
          blockers: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

/** Distinct from literal assignments: consumers must explicitly support all bound policies. */
export const ScheduledCombinedTripAssignmentDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-combined-trip-assignments'),
    identity: reviewIdentity,
    reviewDraftSha256: digest,
    mappingApprovalSha256: digest.nullable(),
    applicabilityPolicy: ScheduledServiceDateApplicabilityPolicySchema,
    assignments: z.array(ScheduledCombinedTripAssignmentSchema),
    coverage,
  })
  .strict();
export type ScheduledCombinedTripAssignmentDocument = z.infer<
  typeof ScheduledCombinedTripAssignmentDocumentSchema
>;

/** Reconstruct saved evidence before the assignment renderer can trust any mapping claim. */
function checkedReview(inputs: ScheduledCombinedReviewInputs, input: unknown) {
  const expected = createScheduledCombinedReview(inputs);
  if (fingerprint(input) !== fingerprint(expected)) {
    throw new Error(
      'Combined mapping report is stale or differs from verified inputs',
    );
  }
  return expected;
}

/** A matching record approves mapping only when supported dates and entity accounting are complete. */
function evaluateApproval(
  review: ScheduledCombinedReview,
  approvalInput?: unknown,
) {
  const approval =
    approvalInput === undefined
      ? undefined
      : ScheduledCombinedMappingApprovalSchema.parse(approvalInput);
  const approvalMatches = Boolean(
    approval &&
      approval.draftSha256 === review.draftSha256 &&
      fingerprint(approval.identity) === fingerprint(review.identity),
  );
  const errors =
    approval && !approvalMatches
      ? ['Approval does not bind this combined mapping report and identity']
      : [];
  const complete =
    review.coverageComplete &&
    !review.unresolvedEntities &&
    review.accounting.unresolvedTripDateCount === 0;
  const mappingReviewEligible = !errors.length && complete && approvalMatches;
  return {
    valid: !errors.length,
    errors,
    draftSha256: review.draftSha256,
    approvalMatches,
    mappingApprovalSha256: approvalMatches ? fingerprint(approval) : null,
    coverageComplete: review.coverageComplete,
    unresolvedEntities: review.unresolvedEntities,
    reviewComplete: mappingReviewEligible,
    readiness: errors.length
      ? 'invalid'
      : !complete
        ? 'unresolved'
        : mappingReviewEligible
          ? 'reviewed-mapping-only'
          : 'unapproved',
    mappingReviewEligible,
    generationEligible: false as const,
  };
}

/** Rebuild every mapping claim before matching optional exact-report approval metadata. */
export function evaluateScheduledCombinedMapping(
  inputs: ScheduledCombinedReviewInputs,
  reviewInput: unknown,
  approvalInput?: unknown,
) {
  return evaluateApproval(checkedReview(inputs, reviewInput), approvalInput);
}

function required<T>(value: T | undefined, kind: string): T {
  if (value === undefined) {
    throw new Error(`Missing verified combined ${kind}`);
  }
  return value;
}

/** Expand proposed dates only; the verified report owns path/date/service/platform validation. */
export function createScheduledCombinedTripAssignmentProposals(
  inputs: ScheduledCombinedReviewInputs,
  reviewInput: unknown,
  approvalInput?: unknown,
) {
  const checked = checkedReview(inputs, reviewInput);
  const review = evaluateApproval(checked, approvalInput);
  if (!review.valid) {
    throw new Error(review.errors.join('; '));
  }
  const sourceTrips = scheduledTripTimesFromGtfs(inputs.context.tables);
  const trips = new Map(sourceTrips.map((trip) => [trip.providerTripId, trip]));
  const entities = new Map(
    checked.associationReview.entities.map((entity) => [
      `${entity.kind}:${entity.providerId}`,
      entity.target,
    ]),
  );
  const sourceRoutes = new Map(
    inputs.context.tables['routes.txt'].map((route) => [route.route_id, route]),
  );
  const assignments: ScheduledCombinedTripAssignment[] = [];
  const gaps: z.infer<typeof coverage>['gaps'] = [];
  const assigned = new Map<string, Set<string>>();
  for (const pattern of checked.associationReview.patterns) {
    const sourceRoute = required(
      sourceRoutes.get(pattern.routeId),
      'source route',
    );
    const route = entities.get(`route:${pattern.routeId}`);
    const agency = entities.get(`agency:${sourceRoute.agency_id}`);
    for (const cell of pattern.reviewCells) {
      if (cell.disposition !== 'proposed') {
        gaps.push({
          providerPatternId: pattern.providerPatternId,
          providerTripIds: pattern.tripIds,
          serviceDates: cell.serviceDates,
          blockers: cell.blockers,
        });
        continue;
      }
      if (route?.kind !== 'line' || agency?.kind !== 'operator') {
        throw new Error(
          'Proposed combined assignment has unresolved route or operator',
        );
      }
      const target = required(cell.target, 'service target');
      const targets =
        target.kind === 'sharedServiceRevisions' ? target.members : [target];
      const candidates = targets.map((member) => ({
        membership: ScheduledServiceMembershipSchema.parse({
          serviceId: member.id,
          revisionId: member.revisionId,
        }),
        evidence: required(
          pattern.platformAssociations.find((candidate) =>
            sameTarget(candidate.target, member),
          ),
          'platform association',
        ),
      }));
      for (const tripId of pattern.tripIds) {
        const trip = required(trips.get(tripId), 'source trip');
        const dates = assigned.get(tripId) ?? new Set<string>();
        for (const date of cell.serviceDates) {
          if (dates.has(date)) {
            throw new Error(
              `Overlapping combined assignment: ${tripId}:${date}`,
            );
          }
          dates.add(date);
        }
        assigned.set(tripId, dates);
        const calls = trip.stopTimes.map((time, index) => {
          const entity = entities.get(`stop:${time.providerStopId}`);
          if (
            (entity?.kind !== 'platform' && entity?.kind !== 'platformGroup') ||
            !entity.stationId
          ) {
            throw new Error(
              'Proposed combined assignment has unresolved physical stop',
            );
          }
          const occurrences = candidates.map((candidate) => ({
            ...candidate,
            occurrence: required(
              candidate.evidence.occurrences[index],
              'source occurrence',
            ),
          }));
          if (
            occurrences.some(
              (item) => item.occurrence.stopId !== time.providerStopId,
            )
          ) {
            throw new Error(
              'Combined assignment occurrence differs from source order',
            );
          }
          const platformIds =
            entity.kind === 'platformGroup' ? entity.platformIds : [entity.id];
          return {
            ...time,
            index,
            stationId: entity.stationId,
            platformSemantics: occurrences[0].occurrence.semantics,
            platforms: [...platformIds].sort().map((platformId) => {
              const physical = required(
                occurrences[0].occurrence.platforms.find(
                  (platform) => platform.platformId === platformId,
                ),
                'physical platform',
              );
              return {
                platformId,
                boardingStatus: physical.boardingStatus,
                accessByService: occurrences.map((item) => {
                  const platform = required(
                    item.occurrence.platforms.find(
                      (platform) => platform.platformId === platformId,
                    ),
                    'service platform',
                  );
                  const hasOnwardAlighting = trip.stopTimes
                    .slice(index + 1)
                    .some((laterTime, offset) => {
                      const later = required(
                        item.evidence.occurrences[index + 1 + offset],
                        'later occurrence',
                      );
                      return later.platforms.some(
                        (laterPlatform) =>
                          scheduledPlatformAssociationAccess(
                            laterPlatform,
                            {
                              pickup: String(laterTime.pickupType),
                              dropOff: String(laterTime.dropOffType),
                            },
                            false,
                          ).passengerAlightingEligible,
                      );
                    });
                  const access = scheduledPlatformAssociationAccess(
                    platform,
                    {
                      pickup: String(time.pickupType),
                      dropOff: String(time.dropOffType),
                    },
                    hasOnwardAlighting,
                  );
                  return {
                    ...item.membership,
                    serviceScope: platform.serviceScope,
                    passengerBoardingEligible: access.passengerBoardingEligible,
                    passengerAlightingEligible:
                      access.passengerAlightingEligible,
                  };
                }),
              };
            }),
          };
        });
        assignments.push(
          ScheduledCombinedTripAssignmentSchema.parse({
            providerPatternId: pattern.providerPatternId,
            providerTripId: tripId,
            providerRouteId: trip.providerRouteId,
            providerCalendarId: trip.providerCalendarId,
            serviceDates: cell.serviceDates,
            lineId: route.id,
            serviceMemberships: candidates.map(
              (candidate) => candidate.membership,
            ),
            destinationStationId: required(calls.at(-1), 'destination')
              .stationId,
            pathBasis: targets.some(
              (member) => member.match === 'sourceJourney',
            )
              ? 'supplied-source-order'
              : 'canonical-ordered-path',
            routeMapping: {
              providerRouteId: pattern.routeId,
              lineId: route.id,
              providerAgencyId: sourceRoute.agency_id,
              operatorId: agency.id,
            },
            calls,
          }),
        );
      }
    }
  }
  assignments.sort(
    (a, b) =>
      compareStrings(a.providerTripId, b.providerTripId) ||
      compareStrings(a.serviceDates[0], b.serviceDates[0]),
  );
  const assignedTripDateCount = [...assigned.values()].reduce(
    (count, dates) => count + dates.size,
    0,
  );
  const gapCount = gaps.reduce(
    (count, gap) =>
      count + gap.providerTripIds.length * gap.serviceDates.length,
    0,
  );
  if (
    assignedTripDateCount !== checked.accounting.proposedTripDateCount ||
    gapCount !== checked.accounting.unresolvedTripDateCount ||
    assignedTripDateCount + gapCount !==
      checked.accounting.supportedTripDateCount
  ) {
    throw new Error(
      'Combined assignments do not account for the supported population',
    );
  }
  const document = ScheduledCombinedTripAssignmentDocumentSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-combined-trip-assignments',
    identity: checked.identity,
    reviewDraftSha256: checked.draftSha256,
    mappingApprovalSha256: review.mappingApprovalSha256,
    applicabilityPolicy: checked.applicabilityPolicy,
    assignments,
    coverage: {
      sourceTripCount: sourceTrips.length,
      assignedTripCount: assigned.size,
      literalTripDateCount: checked.accounting.literalTripDateCount,
      effectiveTripDateCount: checked.accounting.effectiveTripDateCount,
      supportedTripDateCount: checked.accounting.supportedTripDateCount,
      outsideTripDateCount: checked.accounting.outsideTripDateCount,
      assignedTripDateCount,
      unassignedTripDateCount: gapCount,
      excludedTripDateCount: 0,
      tripDateCoverageComplete: gapCount === 0,
      gaps,
    },
  });
  return {
    document,
    assignmentsSha256: fingerprint(document),
    review,
    generationEligible: false as const,
  };
}

/** Verify persisted proposals against original inputs, report and approval; never trust edited access or coverage. */
export function verifyScheduledCombinedTripAssignments(
  inputs: ScheduledCombinedReviewInputs,
  reviewInput: unknown,
  documentInput: unknown,
  approvalInput?: unknown,
) {
  const expected = createScheduledCombinedTripAssignmentProposals(
    inputs,
    reviewInput,
    approvalInput,
  );
  const document =
    ScheduledCombinedTripAssignmentDocumentSchema.parse(documentInput);
  if (fingerprint(document) !== expected.assignmentsSha256) {
    throw new Error(
      'Combined assignments are stale or differ from verified source, applicability or mapping claims',
    );
  }
  return {
    valid: true as const,
    assignmentsSha256: expected.assignmentsSha256,
    coverage: expected.document.coverage,
    review: expected.review,
    generationEligible: false as const,
  };
}
