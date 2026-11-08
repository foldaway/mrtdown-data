import z from 'zod';
import { hashBytes } from './capture.js';
import {
  derivePlatformGroup,
  groupedPlatformDiagnosticsAllow,
  type PlatformGroupTarget,
} from './groupedPlatforms.js';
import { ReconciliationIdentitySchema } from './reconciliation.js';
import { buildDateScopedReconciliationEvidence } from './reconciliationEvidence.js';
import { auditSchedule } from './schedule.js';
import { createScheduledHolidayReviewDraft } from './scheduledHolidayReview.js';
import {
  reviewScheduledPlatformAllocations,
  ScheduledPlatformAllocationPolicySchema,
} from './scheduledPlatformAllocations.js';
import {
  createScheduledSourceJourneyMappingDraft,
  reviewScheduledSourceJourneys,
  type ScheduledSourceJourneyMappingDraft,
} from './scheduledSourceJourneys.js';
import {
  operatorMatchesDate,
  sameTarget,
  targetOnDate,
} from './scopedReviewContext.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';
import {
  prepareSharedServiceMembershipClaims,
  ScheduledSharedServiceMembershipClaimsSchema,
} from './sharedServiceMemberships.js';
import { validateSharedServiceSegment } from './sharedServiceTarget.js';

/** Explicit timetable associations, distinct from permission to board every associated platform. */
export const ScheduledPlatformAssociationPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.string().min(1),
    captureSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceManifest: ReconciliationIdentitySchema.shape.sourceManifest,
    dateBasis: z.literal('service-date'),
    timezone: z.literal('Asia/Singapore'),
    serviceDateRange: z
      .object({
        startDate: z.iso.date(),
        endDateExclusive: z.iso.date(),
      })
      .strict()
      .refine((range) => range.startDate < range.endDateExclusive, {
        message: 'Service-date range must have a positive length',
      }),
    basis: z.string().min(1),
    groups: z
      .array(
        z
          .object({
            providerStopId: z.string().min(1),
            stationId: z.string().min(1),
            lineId: z.string().min(1),
            platformCode: z.string().min(1),
            reason: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    allocations: ScheduledPlatformAllocationPolicySchema.shape.allocations,
  })
  .strict();

export type ScheduledPlatformAssociationPolicy = z.infer<
  typeof ScheduledPlatformAssociationPolicySchema
>;

export interface ScheduledPlatformAssociationInputs {
  context: ScopedReviewContext;
  captureSha256: string;
  policy: unknown;
  allocationPolicy: unknown;
  holidayPolicy: unknown;
  holidayCalendar: unknown;
}

/** Keep distinct platform events. Never pass the resulting subset back as a collapsed source group. */
export function scheduledPlatformAssociationAccess(
  platform: { serviceScope: string; boardingStatus: string | null },
  source: { pickup: string; dropOff: string },
  hasOnwardAlighting: boolean,
) {
  z.boolean().parse(hasOnwardAlighting);
  z.enum(['listed', 'excluded', 'unspecified']).parse(platform.serviceScope);
  z.enum(['not_in_service', 'alighting_only'])
    .nullable()
    .parse(platform.boardingStatus);
  z.enum(['0', '1', '2', '3']).parse(source.pickup);
  z.enum(['0', '1', '2', '3']).parse(source.dropOff);
  const inService = platform.boardingStatus !== 'not_in_service';
  const serviceCompatible = platform.serviceScope !== 'excluded';
  return {
    pickup: source.pickup,
    dropOff: source.dropOff,
    boardingStatus: platform.boardingStatus,
    passengerBoardingEligible:
      serviceCompatible &&
      inService &&
      platform.boardingStatus !== 'alighting_only' &&
      source.pickup !== '1' &&
      hasOnwardAlighting,
    passengerAlightingEligible:
      serviceCompatible && inService && source.dropOff !== '1',
  };
}

/** Opt-in review only. Existing literal/holiday mapping and assignment contracts remain strict. */
export function createScheduledPlatformAssociationReview(
  inputs: ScheduledPlatformAssociationInputs,
) {
  return buildScheduledPlatformAssociationReview(inputs).review;
}

/** Internal composition boundary: source journeys and memberships are independently reconstructed. */
export function buildScheduledPlatformAssociationReview(
  inputs: ScheduledPlatformAssociationInputs,
  composition?: {
    sourceJourneyPolicy: unknown;
    sharedServiceMemberships?: unknown;
    captureServiceDate?: string;
  },
) {
  const { context } = inputs;
  const captureDate = composition?.captureServiceDate;
  const captureRevisions = captureDate
    ? new Map(
        context.topology.services.map((service) => [
          service.id,
          new Set(
            service.revisions
              .filter(
                (revision) =>
                  revision.startAt <= captureDate &&
                  (revision.endAt === null || captureDate < revision.endAt),
              )
              .map((revision) => revision.id),
          ),
        ]),
      )
    : undefined;
  const policy = ScheduledPlatformAssociationPolicySchema.parse(inputs.policy);
  if (
    policy.captureSha256 !== inputs.captureSha256 ||
    fingerprint(policy.sourceManifest) !==
      fingerprint(context.identity.sourceManifest)
  ) {
    throw new Error(
      'Platform associations must bind the verified capture and original source manifest',
    );
  }
  const baseline = reviewScheduledPlatformAllocations(
    context,
    inputs.allocationPolicy,
    inputs.holidayPolicy,
  );
  const allYear = createScheduledHolidayReviewDraft(
    baseline.context,
    inputs.holidayPolicy,
    inputs.holidayCalendar,
  );
  if (
    allYear.patterns.length !== auditSchedule(context.tables).patterns.length
  ) {
    throw new Error(
      'Platform association review requires complete capture family coverage',
    );
  }
  const additional = reviewScheduledPlatformAllocations(
    baseline.context,
    {
      schemaVersion: 1,
      revision: policy.revision,
      sourceManifest: policy.sourceManifest,
      allocations: policy.allocations,
    },
    inputs.holidayPolicy,
  );
  let reviewContext = additional.context;
  let sourceJourneyReview: ScheduledSourceJourneyMappingDraft | undefined;
  const memberships =
    composition?.sharedServiceMemberships === undefined
      ? undefined
      : ScheduledSharedServiceMembershipClaimsSchema.parse(
          composition.sharedServiceMemberships,
        );
  const sharedTargets = new Map<
    string,
    NonNullable<typeof memberships>['claims'][number]['target']
  >();
  if (composition) {
    const prepared = reviewScheduledSourceJourneys(
      context,
      composition.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    sourceJourneyReview = createScheduledSourceJourneyMappingDraft(
      context,
      composition.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    if (memberships) {
      const mapping = prepareSharedServiceMembershipClaims(
        sourceJourneyReview.mapping.mapping,
        memberships,
      );
      const dateSets = new Map(
        mapping.dateSets.map((set) => [set.id, set.serviceDates]),
      );
      for (const decision of mapping.decisions) {
        if (
          decision.kind !== 'pattern' ||
          decision.target?.kind !== 'sharedServiceRevisions'
        ) {
          continue;
        }
        for (const date of dateSets.get(decision.dateSetId) ?? []) {
          sharedTargets.set(
            JSON.stringify([decision.providerId, date]),
            decision.target,
          );
        }
      }
    }
    const topology = {
      ...additional.context.topology,
      sourceJourneyRules: prepared.context.sourceJourneyRules,
    };
    reviewContext = {
      ...additional.context,
      topology,
      sourceJourneyRules: prepared.context.sourceJourneyRules,
      identity: {
        ...additional.context.identity,
        topology: {
          projectionVersion: 1,
          sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
        },
      },
    };
  }
  const associatedGroups = new Map<string, PlatformGroupTarget>();
  const seenPlatforms = new Set<string>();
  for (const rule of policy.groups) {
    const rows = context.tables['stops.txt'].filter(
      (row) => row.stop_id === rule.providerStopId,
    );
    const group = derivePlatformGroup(context, rule.providerStopId);
    if (
      associatedGroups.has(rule.providerStopId) ||
      rows.length !== 1 ||
      rows[0].platform_code !== rule.platformCode ||
      !group ||
      group.stationId !== rule.stationId ||
      group.lineId !== rule.lineId ||
      !allYear.policy.families.some(
        (family) => family.lineId === rule.lineId,
      ) ||
      group.platformIds.some((id) => seenPlatforms.has(id))
    ) {
      throw new Error(
        'Platform association requires a unique, complete literal source group in the review families',
      );
    }
    const entity = allYear.entities.find(
      (item) => item.kind === 'stop' && item.providerId === rule.providerStopId,
    );
    if (
      entity?.disposition !== 'matched' ||
      fingerprint(entity.target) !== fingerprint(group)
    ) {
      throw new Error(
        'Platform association has an unresolved source identity or parent',
      );
    }
    for (const id of group.platformIds) seenPlatforms.add(id);
    associatedGroups.set(rule.providerStopId, group);
  }
  const inRange = (date: string) =>
    date >= policy.serviceDateRange.startDate &&
    date < policy.serviceDateRange.endDateExclusive;
  const dates = new Map(
    allYear.patterns.map((pattern) => [
      pattern.providerPatternId,
      pattern.serviceDates.filter(inRange),
    ]),
  );
  const evidence = buildDateScopedReconciliationEvidence(
    context.tables,
    reviewContext.identity,
    reviewContext.topology,
    dates,
    reviewContext.sourceJourneyRules,
  );
  const strictGroups = new Map<string, PlatformGroupTarget>();
  for (const item of allYear.entities) {
    if (
      item.kind === 'stop' &&
      item.target?.kind === 'platformGroup' &&
      !associatedGroups.has(item.providerId)
    ) {
      strictGroups.set(item.providerId, item.target);
    }
  }
  const patterns = allYear.patterns.map((original) => {
    const facts = evidence.patterns.find(
      (item) => item.providerId === original.providerPatternId,
    );
    if (!facts)
      throw new Error('Missing supported platform association evidence');
    const sourceRoute = context.tables['routes.txt'].find(
      (row) => row.route_id === original.routeId,
    );
    const operator = allYear.entities.find(
      (item) =>
        item.kind === 'agency' && item.providerId === sourceRoute?.agency_id,
    );
    const operatorId =
      operator?.target && 'id' in operator.target
        ? operator.target.id
        : undefined;
    const dependenciesResolved = original.stopIds.every((id) =>
      allYear.entities.some(
        (item) =>
          item.kind === 'stop' &&
          item.providerId === id &&
          item.disposition === 'matched',
      ),
    );
    type Target =
      | (typeof facts.candidates)[number]['target']
      | NonNullable<typeof memberships>['claims'][number]['target'];
    const cells = new Map<
      string,
      {
        disposition: 'proposed' | 'unresolved';
        target?: Target;
        blockers: string[];
        serviceDates: string[];
      }
    >();
    for (const scope of facts.dateScopes.scopes) {
      for (const date of scope.serviceDates) {
        const membership = sharedTargets.get(
          JSON.stringify([original.providerPatternId, date]),
        );
        if (membership) {
          if (
            scope.candidates.length !== membership.members.length ||
            scope.candidates.some(
              (candidate) =>
                !membership.members.some((member) =>
                  sameTarget(candidate, member),
                ),
            )
          ) {
            throw new Error(
              'Combined memberships must retain every dated candidate',
            );
          }
          validateSharedServiceSegment(
            reviewContext,
            original.stopIds,
            membership.members,
          );
        }
        const target =
          membership ??
          (scope.candidates.length === 1 ? scope.candidates[0] : undefined);
        const targets =
          target?.kind === 'sharedServiceRevisions'
            ? target.members
            : target
              ? [target]
              : [];
        const candidates = targets.map((target) =>
          facts.candidates.find((item) => sameTarget(item.target, target)),
        );
        const blockers: string[] = [];
        if (!target)
          blockers.push(
            scope.candidates.length ? 'temporal-ambiguity' : 'temporal-gap',
          );
        if (
          captureRevisions &&
          targets.some(
            (member) =>
              member.revisionId === undefined ||
              !captureRevisions.get(member.id)?.has(member.revisionId),
          )
        ) {
          blockers.push('service-revision-inactive-at-capture');
        }
        if (!dependenciesResolved)
          blockers.push('unresolved-identity-or-platform');
        if (
          !operatorMatchesDate(
            context.topology,
            original.lineId ?? undefined,
            operatorId,
            date,
          )
        )
          blockers.push('operator-period');
        const associationsCompatible = candidates.every((candidate) =>
          candidate?.occurrences.every((occurrence) => {
            const group = associatedGroups.get(occurrence.stopId);
            return (
              !group ||
              group.platformIds.every((id) =>
                occurrence.platforms.some(
                  (platform) =>
                    platform.platformId === id &&
                    platform.serviceScope !== 'excluded',
                ),
              )
            );
          }),
        );
        if (
          target &&
          (targets.some(
            (member) =>
              !targetOnDate(facts.platformDiagnosticScopes, date, member) ||
              !groupedPlatformDiagnosticsAllow(facts, member, strictGroups),
          ) ||
            !associationsCompatible)
        ) {
          blockers.push('platform-or-boarding');
        }
        const claim = {
          disposition: blockers.length
            ? ('unresolved' as const)
            : ('proposed' as const),
          ...(target && !blockers.length ? { target } : {}),
          blockers,
        };
        const key = fingerprint(claim);
        const cell = cells.get(key) ?? { ...claim, serviceDates: [] };
        cell.serviceDates.push(date);
        cells.set(key, cell);
      }
    }
    const platformAssociations = facts.candidates
      .filter((candidate) => candidate.revisionDateCount > 0)
      .map((candidate) => ({
        target: candidate.target,
        occurrences: candidate.occurrences.map((occurrence) => ({
          index: occurrence.index,
          stopId: occurrence.stopId,
          semantics: associatedGroups.has(occurrence.stopId)
            ? ('distinct-platform-associations' as const)
            : ('complete-source-alternatives' as const),
          platforms: occurrence.platforms.map((platform) => ({
            ...platform,
            accessBySourceRule: occurrence.pickupDropOff.map((rule) =>
              scheduledPlatformAssociationAccess(
                platform,
                rule,
                candidate.occurrences
                  .slice(occurrence.index + 1)
                  .some((later) =>
                    later.pickupDropOff.every(
                      (access) => access.dropOff !== '1',
                    ),
                  ),
              ),
            ),
          })),
        })),
      }));
    return {
      ...original,
      allYearReviewCells: original.reviewCells,
      allYearCandidateEvidence: original.candidateEvidence,
      allYearDateScopes: original.dateScopes,
      allYearPlatformDiagnosticScopes: original.platformDiagnosticScopes,
      supportedServiceDates: dates.get(original.providerPatternId) ?? [],
      outsideServiceDates: original.serviceDates.filter(
        (date) => !inRange(date),
      ),
      reviewCells: [...cells.values()],
      candidateEvidence: facts.candidates,
      dateScopes: facts.dateScopes,
      platformDiagnosticScopes: facts.platformDiagnosticScopes,
      platformAssociations,
    };
  });
  const count = (
    getDates: (pattern: (typeof patterns)[number]) => readonly string[],
  ) =>
    patterns.reduce(
      (total, pattern) =>
        total + pattern.tripIds.length * getDates(pattern).length,
      0,
    );
  const unresolvedTripDateCount = count((pattern) =>
    pattern.reviewCells
      .filter((cell) => cell.disposition === 'unresolved')
      .flatMap((cell) => cell.serviceDates),
  );
  const supportedTripDateCount = count(
    (pattern) => pattern.supportedServiceDates,
  );
  const draft = {
    schemaVersion: 1,
    documentKind: 'gtfs-platform-association-review-draft',
    reviewPurpose: 'timetable-association-with-separate-passenger-access',
    identity: {
      source: context.identity,
      captureSha256: inputs.captureSha256,
      policySha256: fingerprint(policy),
      allocationPolicySha256: fingerprint(baseline.policy),
      holidayPolicySha256: allYear.identity.policySha256,
      reviewTopologySha256: reviewContext.identity.topology.sha256,
      supportedDatePopulationSha256: fingerprint(
        patterns.map((pattern) => ({
          providerPatternId: pattern.providerPatternId,
          serviceDates: pattern.supportedServiceDates,
        })),
      ),
    },
    policy,
    allocationChanges: {
      baseline: baseline.changes,
      supportedDatesOnly: additional.changes,
    },
    entities: allYear.entities,
    patterns,
    accounting: {
      literalTripDateCount: count((pattern) => pattern.sourceServiceDates),
      effectiveTripDateCount: count((pattern) => pattern.serviceDates),
      supportedTripDateCount,
      outsideTripDateCount: count((pattern) => pattern.outsideServiceDates),
      proposedTripDateCount: supportedTripDateCount - unresolvedTripDateCount,
      unresolvedTripDateCount,
      excludedTripDateCount: 0,
    },
    approvalMatches: false,
    mappingReviewEligible: false,
    generationEligible: false,
  } as const;
  return {
    review: { ...draft, draftSha256: fingerprint(draft) },
    sourceJourneyReview,
  };
}

/** Every saved claim is reconstructed; edited, stale or differently scoped reviews fail closed. */
export function verifyScheduledPlatformAssociationReview(
  inputs: ScheduledPlatformAssociationInputs,
  input: unknown,
) {
  const expected = createScheduledPlatformAssociationReview(inputs);
  if (fingerprint(input) !== fingerprint(expected))
    throw new Error(
      'Platform association review is stale or differs from verified inputs',
    );
  return {
    valid: true as const,
    draftSha256: expected.draftSha256,
    mappingReviewEligible: false as const,
    generationEligible: false as const,
  };
}

export type ScheduledPlatformAssociationReview = ReturnType<
  typeof createScheduledPlatformAssociationReview
>;
