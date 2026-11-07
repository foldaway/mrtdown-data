import { scheduledServiceDayInstant } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { platformAssociationFixture } from './__tests__/platformAssociationFixture.js';
import { ScheduledTripAssignmentDocumentSchema } from './assignmentInput.js';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { auditSchedule } from './schedule.js';
import {
  createScheduledCombinedReview,
  verifyScheduledCombinedReview,
} from './scheduledCombinedReview.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import {
  applyScheduledSourceJourneyServiceMemberships,
  createScheduledSourceJourneyMappingDraft,
} from './scheduledSourceJourneys.js';

/** Synthetic composition of a shared segment, restricted group and repeated source journey. */
function fixture(sharedGroup = false) {
  const { policy: associationPolicy, ...base } = platformAssociationFixture();
  const { context } = base;
  context.tables['routes.txt'].push({
    route_id: 'NEL_SHARED',
    agency_id: 'SBST',
    route_type: '1',
  });
  base.holidayPolicy.families[0].providerRouteIds.push('NEL_SHARED');
  context.topology.stations.push({
    id: 'T',
    stationCodes: [
      { lineId: 'NEL', code: 'NE4', startedAt: '2000-01-01', endedAt: null },
    ],
    platforms: [
      {
        id: 'T_A',
        label: 'A',
        lineId: 'NEL',
        serviceIds: ['SHARED_A', 'SHARED_B'],
        boardingStatus: null,
      },
    ],
  });
  context.tables['stops.txt'].push(
    { stop_id: 'T', stop_code: 'NE4', location_type: '1' },
    {
      stop_id: 'R',
      stop_code: 'NE4',
      parent_station: 'T',
      platform_code: 'A',
      location_type: '0',
    },
  );
  context.topology.stations[0].platforms[0].serviceIds.push(
    'SHARED_A',
    'SHARED_B',
  );
  for (const id of ['SHARED_A', 'SHARED_B']) {
    context.topology.lines[0].serviceIds.push(id);
    context.topology.services.push({
      id,
      lineId: 'NEL',
      revisions: [
        {
          id: 'R',
          startAt: '2000-01-01',
          endAt: null,
          stations: [
            { stationId: 'S', displayCode: 'NE1' },
            { stationId: 'T', displayCode: 'NE4' },
          ],
        },
      ],
    });
  }
  for (const [trip_id, route_id, stops] of [
    ['UNUSUAL', 'NEL_TEST', ['P', 'Q', 'P', 'Q']],
    ['SHARED', 'NEL_SHARED', [sharedGroup ? 'P' : 'P_SINGLE', 'R']],
  ] as const) {
    context.tables['trips.txt'].push({
      trip_id,
      route_id,
      service_id: 'WD',
      direction_id: '0',
    });
    context.tables['stop_times.txt'].push(
      ...stops.map((stop_id, index) => ({
        trip_id,
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: `25:0${index}:00`,
        departure_time: `25:0${index}:00`,
      })),
    );
  }
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const audit = auditSchedule(context.tables);
  const unusual = audit.patterns.find((pattern) =>
    pattern.tripIds.includes('UNUSUAL'),
  );
  const shared = audit.patterns.find((pattern) =>
    pattern.tripIds.includes('SHARED'),
  );
  if (!unusual || !shared) {
    throw new Error('Missing synthetic source pattern');
  }
  const population = resolveScheduledHolidayDates(
    context,
    base.holidayPolicy,
    base.holidayCalendar,
  );
  const dates = (id: string) =>
    population.patterns
      .find((pattern) => pattern.providerPatternId === id)
      ?.serviceDates.filter(
        (date) => date >= '2026-11-01' && date < '2026-12-01',
      ) ?? [];
  const sourceJourneyPolicy = {
    schemaVersion: 1,
    revision: 'synthetic-source-order',
    sourceManifest: context.identity.sourceManifest,
    passengerCallRule: 'timed-source-occurrences',
    journeys: [
      {
        providerPatternId: unusual.id,
        lineId: 'NEL',
        serviceId: 'SVC',
        serviceDates: dates(unusual.id),
        reason: 'Preserve the supplied reversal and repeated calls',
      },
    ],
  };
  const applicabilityPolicy = {
    schemaVersion: 1,
    revision: 'synthetic-november',
    captureSha256: base.captureSha256,
    sourceManifest: context.identity.sourceManifest,
    dateBasis: 'service-date',
    timezone: 'Asia/Singapore',
    serviceDateRange: { ...associationPolicy.serviceDateRange },
    basis: 'Explicit supported operations assumption',
  };
  const inputs = {
    ...base,
    associationPolicy,
    sourceJourneyPolicy,
    applicabilityPolicy,
  };
  const source = createScheduledSourceJourneyMappingDraft(
    context,
    sourceJourneyPolicy,
    base.allocationPolicy,
    base.holidayPolicy,
    base.holidayCalendar,
  );
  const sharedServiceMemberships = {
    schemaVersion: 1,
    documentKind: 'gtfs-shared-service-membership-claims',
    baseDraftSha256: groupedScopedReviewDraftSha256(source.mapping.mapping),
    claims: [
      {
        providerPatternId: shared.id,
        serviceDates: dates(shared.id),
        target: {
          kind: 'sharedServiceRevisions',
          members: ['SHARED_A', 'SHARED_B'].map((id) => ({
            kind: 'serviceRevision',
            id,
            revisionId: 'R',
            match: 'exact',
          })),
        },
        reason: 'Both services share the complete supplied segment',
      },
    ],
  };
  return {
    inputs,
    sharedServiceMemberships,
    unusualId: unusual.id,
    sharedId: shared.id,
  };
}

describe('combined review on explicit service-date applicability', () => {
  it('composes shared memberships, repeated source calls and restricted physical associations without duplicate trip accounting', () => {
    const { inputs, sharedServiceMemberships, unusualId, sharedId } = fixture();
    const before = structuredClone(inputs);
    const unresolved = createScheduledCombinedReview(inputs);
    expect(unresolved.accounting.unresolvedTripDateCount).toBe(20);
    const review = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    expect(inputs).toEqual(before);
    expect(review.accounting).toMatchObject({
      supportedTripDateCount: 70,
      proposedTripDateCount: 70,
      unresolvedTripDateCount: 0,
      excludedTripDateCount: 0,
    });
    expect(review.accounting.effectiveTripDateCount).toBe(
      review.accounting.supportedTripDateCount +
        review.accounting.outsideTripDateCount,
    );
    expect(review).toMatchObject({
      readiness: 'unapproved',
      unresolvedEntities: 0,
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    const unusual = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === unusualId,
    );
    expect(unusual?.stopIds).toEqual(['P', 'Q', 'P', 'Q']);
    expect(
      unusual?.reviewCells.every((cell) => cell.disposition === 'proposed'),
    ).toBe(true);
    const grouped = unusual?.platformAssociations[0].occurrences.filter(
      (occurrence) => occurrence.stopId === 'P',
    );
    expect(grouped).toHaveLength(2);
    for (const occurrence of grouped ?? []) {
      expect(
        occurrence.platforms.map((platform) => platform.platformId).sort(),
      ).toEqual(['S_C', 'platform-S']);
      expect(
        occurrence.platforms.find((platform) => platform.platformId === 'S_C')
          ?.accessBySourceRule[0],
      ).toMatchObject({
        boardingStatus: 'not_in_service',
        passengerBoardingEligible: false,
        passengerAlightingEligible: false,
      });
    }
    const shared = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(shared?.reviewCells[0].target?.kind).toBe('sharedServiceRevisions');
    expect(
      verifyScheduledCombinedReview(
        { ...inputs, sharedServiceMemberships },
        review,
      ).valid,
    ).toBe(true);
    expect(
      ScheduledTripAssignmentDocumentSchema.safeParse(review).success,
    ).toBe(false);
  });

  it('validates shared journeys through associated groups using composed access while standalone mapping stays strict', () => {
    const { inputs, sharedServiceMemberships, sharedId } = fixture(true);
    const source = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    expect(() =>
      applyScheduledSourceJourneyServiceMemberships(
        inputs.context,
        inputs.sourceJourneyPolicy,
        inputs.allocationPolicy,
        inputs.holidayPolicy,
        inputs.holidayCalendar,
        source,
        sharedServiceMemberships,
      ),
    ).toThrow(/grouped platform diagnostics/);
    const review = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    expect(review.accounting.unresolvedTripDateCount).toBe(0);
    const shared = review.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(shared?.reviewCells[0].target?.kind).toBe('sharedServiceRevisions');
    for (const candidate of shared?.platformAssociations ?? []) {
      const platforms = candidate.occurrences[0].platforms;
      expect(platforms).toHaveLength(2);
      expect(
        platforms.find((platform) => platform.platformId === 'S_C')
          ?.accessBySourceRule[0],
      ).toMatchObject({
        boardingStatus: 'not_in_service',
        passengerBoardingEligible: false,
        passengerAlightingEligible: false,
      });
      expect(
        platforms.find((platform) => platform.platformId === 'platform-S')
          ?.accessBySourceRule[0].passengerBoardingEligible,
      ).toBe(true);
    }
    inputs.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    inputs.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(inputs.context.topology)),
    );
    const restrictedSource = createScheduledSourceJourneyMappingDraft(
      inputs.context,
      inputs.sourceJourneyPolicy,
      inputs.allocationPolicy,
      inputs.holidayPolicy,
      inputs.holidayCalendar,
    );
    sharedServiceMemberships.baseDraftSha256 = groupedScopedReviewDraftSha256(
      restrictedSource.mapping.mapping,
    );
    const restricted = createScheduledCombinedReview({
      ...inputs,
      sharedServiceMemberships,
    });
    const blocked = restricted.associationReview.patterns.find(
      (pattern) => pattern.providerPatternId === sharedId,
    );
    expect(
      blocked?.reviewCells.every(
        (cell) =>
          cell.disposition === 'unresolved' &&
          cell.blockers.includes('platform-or-boarding'),
      ),
    ).toBe(true);
  });

  it('keeps original service-date boundaries for 25-hour calls without approving outside dates', () => {
    const { inputs } = fixture();
    const review = createScheduledCombinedReview(inputs);
    const patterns = review.associationReview.patterns;
    const saturday = patterns.find(
      (pattern) => pattern.providerCalendarId === 'SA',
    );
    const weekday = patterns.find(
      (pattern) => pattern.providerCalendarId === 'WD',
    );
    expect(saturday?.outsideServiceDates).toContain('2026-10-31');
    expect(saturday?.supportedServiceDates).not.toContain('2026-10-31');
    expect(weekday?.supportedServiceDates).toContain('2026-11-30');
    expect(weekday?.supportedServiceDates).not.toContain('2026-12-01');
    expect(scheduledServiceDayInstant('2026-11-30', 25 * 3600)).toBe(
      '2026-11-30T17:00:00Z',
    );
    for (const pattern of patterns) {
      expect(
        [
          ...pattern.supportedServiceDates,
          ...pattern.outsideServiceDates,
        ].sort(),
      ).toEqual(pattern.serviceDates);
    }
  });

  it('rejects incompatible capture or date scope, stale memberships and unsupported claim dates', () => {
    const { inputs, sharedServiceMemberships } = fixture();
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        captureSha256: 'e'.repeat(64),
      }),
    ).toThrow(/capture-bound/);
    const bounds = structuredClone(inputs);
    bounds.applicabilityPolicy.serviceDateRange.endDateExclusive = '2026-11-30';
    expect(() => createScheduledCombinedReview(bounds)).toThrow(
      /identical association bounds/,
    );
    const stale = structuredClone(sharedServiceMemberships);
    stale.baseDraftSha256 = 'a'.repeat(64);
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        sharedServiceMemberships: stale,
      }),
    ).toThrow(/base mapping/);
    const outside = structuredClone(sharedServiceMemberships);
    outside.claims[0].serviceDates.push('2026-12-01');
    expect(() =>
      createScheduledCombinedReview({
        ...inputs,
        sharedServiceMemberships: outside,
      }),
    ).toThrow(/inside supported applicability/);
  });

  it('reconstructs saved evidence instead of accepting removed dates, collapsed groups or changed access', () => {
    const { inputs } = fixture();
    const review = createScheduledCombinedReview(inputs);
    for (const mutate of [
      (copy: typeof review) => {
        copy.associationReview.patterns[0].outsideServiceDates.pop();
      },
      (copy: typeof review) => {
        copy.associationReview.patterns[0].platformAssociations[0].occurrences[0].platforms.pop();
      },
      (copy: typeof review) => {
        copy.accounting.unresolvedTripDateCount = 0;
      },
    ]) {
      const copy = structuredClone(review);
      mutate(copy);
      expect(() => verifyScheduledCombinedReview(inputs, copy)).toThrow(
        /stale/,
      );
    }
  });
});
