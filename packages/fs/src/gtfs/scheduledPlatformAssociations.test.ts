import { scheduledServiceDayInstant } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { ScheduledTripAssignmentDocumentSchema } from './assignmentInput.js';
import { hashBytes } from './capture.js';
import {
  createScheduledPlatformAllocationMappingDraft,
  ScheduledPlatformAllocationMappingDraftSchema,
} from './scheduledPlatformAllocations.js';
import {
  createScheduledPlatformAssociationReview,
  scheduledPlatformAssociationAccess,
  verifyScheduledPlatformAssociationReview,
} from './scheduledPlatformAssociations.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing synthetic fixture record');
  return value;
}

function fixture() {
  const {
    context,
    policy: holidayPolicy,
    calendar: holidayCalendar,
  } = holidayFixture();
  context.tables['routes.txt'] = context.tables['routes.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['trips.txt'] = context.tables['trips.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['stop_times.txt'] = context.tables['stop_times.txt'].filter(
    (row) => row.trip_id.startsWith('NEL_TEST_'),
  );
  required(
    context.tables['stops.txt'].find((row) => row.stop_id === 'P'),
  ).platform_code = 'A / C';
  context.tables['stops.txt'].push({
    stop_id: 'P_SINGLE',
    stop_code: 'NE1',
    parent_station: 'S',
    platform_code: 'A',
    location_type: '0',
  });
  context.topology.services.push({
    id: 'REVERSE',
    lineId: 'NEL',
    revisions: [
      {
        id: 'RR',
        startAt: '2000-01-01',
        endAt: null,
        stations: [
          { stationId: 'D', displayCode: 'NE3' },
          { stationId: 'S', displayCode: 'NE1' },
        ],
      },
    ],
  });
  context.topology.lines[0].serviceIds.push('REVERSE');
  context.topology.stations[0].platforms.push({
    id: 'S_C',
    label: 'C',
    lineId: 'NEL',
    serviceIds: [],
    boardingStatus: 'not_in_service',
  });
  context.topology.stations[1].platforms[0].serviceIds = ['REVERSE'];
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  return {
    context,
    captureSha256: 'd'.repeat(64),
    holidayPolicy,
    holidayCalendar,
    allocationPolicy: {
      schemaVersion: 1,
      revision: 'baseline',
      sourceManifest: context.identity.sourceManifest,
      allocations: [
        {
          providerStopId: 'P_SINGLE',
          stationId: 'S',
          lineId: 'NEL',
          platformCode: 'A',
          serviceIds: ['REVERSE'],
          reason: 'Synthetic baseline rule',
        },
      ],
    },
    policy: {
      schemaVersion: 1,
      revision: 'review-v1',
      captureSha256: 'd'.repeat(64),
      sourceManifest: context.identity.sourceManifest,
      dateBasis: 'service-date',
      timezone: 'Asia/Singapore',
      serviceDateRange: {
        startDate: '2026-11-01',
        endDateExclusive: '2026-12-01',
      },
      basis: 'Synthetic maintainer assumption',
      groups: [
        {
          providerStopId: 'P',
          stationId: 'S',
          lineId: 'NEL',
          platformCode: 'A / C',
          reason:
            'Associate both distinct platforms; preserve their restrictions',
        },
      ],
      allocations: [
        {
          providerStopId: 'Q',
          stationId: 'D',
          lineId: 'NEL',
          platformCode: 'B',
          serviceIds: ['SVC'],
          reason: 'Synthetic source precedence at terminal',
        },
      ],
    },
  };
}

describe('distinct platform associations on explicit service dates', () => {
  it('retains both physical members and source rules while accounting for every outside date', () => {
    const inputs = fixture();
    const original = structuredClone(inputs);
    const review = createScheduledPlatformAssociationReview(inputs);
    expect(inputs).toEqual(original);
    expect(review.accounting).toMatchObject({
      effectiveTripDateCount: 365,
      supportedTripDateCount: 30,
      outsideTripDateCount: 335,
      proposedTripDateCount: 30,
      unresolvedTripDateCount: 0,
      excludedTripDateCount: 0,
    });
    expect(review).toMatchObject({
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    for (const pattern of review.patterns) {
      expect(
        [
          ...pattern.supportedServiceDates,
          ...pattern.outsideServiceDates,
        ].sort(),
      ).toEqual(pattern.serviceDates);
      expect(
        pattern.reviewCells.every((cell) => cell.disposition === 'proposed'),
      ).toBe(true);
      expect(
        pattern.allYearReviewCells.every(
          (cell) => cell.disposition === 'unresolved',
        ),
      ).toBe(true);
      const group = pattern.platformAssociations[0].occurrences[0];
      expect(group.semantics).toBe('distinct-platform-associations');
      expect(
        group.platforms.map((platform) => platform.platformId).sort(),
      ).toEqual(['S_C', 'platform-S']);
      expect(
        group.platforms.find((platform) => platform.platformId === 'S_C')
          ?.accessBySourceRule,
      ).toEqual([
        {
          pickup: '0',
          dropOff: '0',
          boardingStatus: 'not_in_service',
          passengerBoardingEligible: false,
          passengerAlightingEligible: false,
        },
      ]);
      expect(
        group.platforms.find((platform) => platform.platformId === 'platform-S')
          ?.accessBySourceRule[0].passengerBoardingEligible,
      ).toBe(true);
      expect(
        pattern.platformAssociations[0].occurrences[1].platforms[0]
          .accessBySourceRule[0].passengerBoardingEligible,
      ).toBe(false);
    }
    expect(
      review.patterns.find((pattern) => pattern.providerCalendarId === 'SU')
        ?.supportedServiceDates,
    ).toContain('2026-11-09');
    expect(
      review.patterns.find((pattern) => pattern.providerCalendarId === 'WD')
        ?.supportedServiceDates,
    ).not.toContain('2026-11-09');
    expect(verifyScheduledPlatformAssociationReview(inputs, review).valid).toBe(
      true,
    );
    expect(() =>
      ScheduledPlatformAllocationMappingDraftSchema.parse(review),
    ).toThrow();
    expect(() => ScheduledTripAssignmentDocumentSchema.parse(review)).toThrow();
  });

  it('keeps October tails outside and November tails inside by original service date', () => {
    const review = createScheduledPlatformAssociationReview(fixture());
    const saturday = required(
      review.patterns.find((pattern) => pattern.providerCalendarId === 'SA'),
    );
    const weekday = required(
      review.patterns.find((pattern) => pattern.providerCalendarId === 'WD'),
    );
    expect(saturday.outsideServiceDates).toContain('2026-10-31');
    expect(saturday.supportedServiceDates).not.toContain('2026-10-31');
    expect(weekday.supportedServiceDates).toContain('2026-11-30');
    expect(weekday.outsideServiceDates).toContain('2026-12-01');
    expect(scheduledServiceDayInstant('2026-10-31', 25 * 3600)).toBe(
      '2026-10-31T17:00:00Z',
    );
    expect(scheduledServiceDayInstant('2026-11-30', 25 * 3600)).toBe(
      '2026-11-30T17:00:00Z',
    );
  });

  it('preserves repeated groups and treats their final occurrence separately', () => {
    const inputs = fixture();
    inputs.context.topology.services[0].revisions[0].stations.push({
      stationId: 'S',
      displayCode: 'NE1',
    });
    for (const trip of inputs.context.tables['trips.txt'])
      inputs.context.tables['stop_times.txt'].push({
        trip_id: trip.trip_id,
        stop_id: 'P',
        stop_sequence: '3',
        arrival_time: '25:04:00',
        departure_time: '25:04:00',
      });
    const review = createScheduledPlatformAssociationReview(inputs);
    for (const pattern of review.patterns) {
      expect(pattern.stopIds).toEqual(['P', 'Q', 'P']);
      expect(
        pattern.reviewCells.every((cell) => cell.disposition === 'proposed'),
      ).toBe(true);
      const occurrences = pattern.platformAssociations[0].occurrences;
      expect(
        occurrences[0].platforms.map((platform) => platform.platformId),
      ).toEqual(
        occurrences[2].platforms.map((platform) => platform.platformId),
      );
      expect(
        occurrences[0].platforms.find(
          (platform) => platform.platformId === 'platform-S',
        )?.accessBySourceRule[0].passengerBoardingEligible,
      ).toBe(true);
      expect(
        occurrences[2].platforms.every(
          (platform) =>
            !platform.accessBySourceRule[0].passengerBoardingEligible,
        ),
      ).toBe(true);
    }
  });

  it('does not use platform preference to select a service or waive a dated code gap', () => {
    const ambiguous = fixture();
    ambiguous.context.topology.services.push({
      ...structuredClone(ambiguous.context.topology.services[0]),
      id: 'OTHER',
    });
    ambiguous.context.topology.lines[0].serviceIds.push('OTHER');
    const review = createScheduledPlatformAssociationReview(ambiguous);
    expect(review.accounting.unresolvedTripDateCount).toBe(30);
    expect(
      review.patterns.every((pattern) =>
        pattern.reviewCells.every((cell) =>
          cell.blockers.includes('temporal-ambiguity'),
        ),
      ),
    ).toBe(true);
    const gap = fixture();
    gap.context.topology.stations[0].stationCodes[0].startedAt = '2026-11-10';
    const partial = createScheduledPlatformAssociationReview(gap);
    expect(partial.accounting.unresolvedTripDateCount).toBe(9);
    expect(partial.accounting.proposedTripDateCount).toBe(21);
  });

  it('does not relax unlisted groups or associations with an excluded service', () => {
    const inputs = fixture();
    required(
      inputs.context.tables['stops.txt'].find((row) => row.stop_id === 'Q'),
    ).platform_code = 'B / C';
    inputs.context.topology.stations[1].platforms.push({
      id: 'D_C',
      label: 'C',
      lineId: 'NEL',
      serviceIds: [],
      boardingStatus: 'not_in_service',
    });
    inputs.policy.allocations[0] = {
      ...inputs.policy.allocations[0],
      providerStopId: 'Q_SINGLE',
    };
    inputs.context.tables['stops.txt'].push({
      stop_id: 'Q_SINGLE',
      stop_code: 'NE3',
      parent_station: 'D',
      platform_code: 'B',
      location_type: '0',
    });
    expect(
      createScheduledPlatformAssociationReview(inputs).accounting
        .unresolvedTripDateCount,
    ).toBe(30);
    const excluded = fixture();
    excluded.context.topology.stations[0].platforms[1].serviceIds = ['REVERSE'];
    expect(
      createScheduledPlatformAssociationReview(excluded).accounting
        .unresolvedTripDateCount,
    ).toBe(30);
  });

  it('requires at least one currently compatible member without changing canonical restrictions', () => {
    const inputs = fixture();
    inputs.context.topology.stations[0].platforms[0].boardingStatus =
      'not_in_service';
    expect(
      createScheduledPlatformAssociationReview(inputs).accounting
        .unresolvedTripDateCount,
    ).toBe(30);
    const strict = fixture();
    const review = createScheduledPlatformAllocationMappingDraft(
      strict.context,
      {
        ...strict.allocationPolicy,
        allocations: [
          ...strict.allocationPolicy.allocations,
          ...strict.policy.allocations,
        ],
      },
      strict.holidayPolicy,
      strict.holidayCalendar,
    );
    expect(
      review.dateReview.patterns.every((pattern) =>
        pattern.reviewCells.every((cell) => cell.disposition === 'unresolved'),
      ),
    ).toBe(true);
  });

  it('rejects wrong captures, changed labels, incomplete identities, duplicate rules and invalid bounds', () => {
    const cases: ((inputs: ReturnType<typeof fixture>) => void)[] = [
      (inputs) => {
        inputs.captureSha256 = 'e'.repeat(64);
      },
      (inputs) => {
        inputs.policy.sourceManifest = { 'stops.txt': 'f'.repeat(64) };
      },
      (inputs) => {
        inputs.policy.groups[0].platformCode = 'A';
      },
      (inputs) => {
        inputs.context.topology.stations[0].platforms.pop();
      },
      (inputs) => {
        inputs.policy.groups.push({ ...inputs.policy.groups[0] });
      },
      (inputs) => {
        required(
          inputs.context.tables['stops.txt'].find((row) => row.stop_id === 'P'),
        ).parent_station = 'D';
      },
      (inputs) => {
        inputs.policy.serviceDateRange.endDateExclusive =
          inputs.policy.serviceDateRange.startDate;
      },
      (inputs) => {
        inputs.policy.serviceDateRange.startDate = '2026-11-31';
      },
    ];
    for (const change of cases) {
      const inputs = fixture();
      change(inputs);
      expect(() => createScheduledPlatformAssociationReview(inputs)).toThrow();
    }
  });

  it('rejects edited member restrictions, collapsed groups and stale policies in saved reviews', () => {
    const inputs = fixture();
    const review = createScheduledPlatformAssociationReview(inputs);
    const collapsed = structuredClone(review);
    collapsed.patterns[0].platformAssociations[0].occurrences[0].platforms.pop();
    expect(() =>
      verifyScheduledPlatformAssociationReview(inputs, collapsed),
    ).toThrow(/stale/);
    const permitted = structuredClone(review);
    required(
      permitted.patterns[0].platformAssociations[0].occurrences[0].platforms.find(
        (platform) => platform.boardingStatus === 'not_in_service',
      ),
    ).accessBySourceRule[0].passengerBoardingEligible = true;
    expect(() =>
      verifyScheduledPlatformAssociationReview(inputs, permitted),
    ).toThrow(/stale/);
    inputs.policy.serviceDateRange.endDateExclusive = '2026-11-30';
    expect(() =>
      verifyScheduledPlatformAssociationReview(inputs, review),
    ).toThrow(/stale/);
  });

  it('keeps arranged access distinct and applies physical restrictions before boarding', () => {
    const regular = { serviceScope: 'listed', boardingStatus: null };
    for (const pickup of ['0', '2', '3'])
      expect(
        scheduledPlatformAssociationAccess(
          regular,
          { pickup, dropOff: '0' },
          true,
        ),
      ).toMatchObject({ pickup, passengerBoardingEligible: true });
    expect(
      scheduledPlatformAssociationAccess(
        regular,
        { pickup: '1', dropOff: '1' },
        true,
      ),
    ).toMatchObject({
      passengerBoardingEligible: false,
      passengerAlightingEligible: false,
    });
    expect(
      scheduledPlatformAssociationAccess(
        { ...regular, boardingStatus: 'alighting_only' },
        { pickup: '0', dropOff: '0' },
        true,
      ),
    ).toMatchObject({
      passengerBoardingEligible: false,
      passengerAlightingEligible: true,
    });
    expect(
      scheduledPlatformAssociationAccess(
        { ...regular, serviceScope: 'excluded' },
        { pickup: '0', dropOff: '0' },
        true,
      ),
    ).toMatchObject({
      passengerBoardingEligible: false,
      passengerAlightingEligible: false,
    });
    expect(() =>
      scheduledPlatformAssociationAccess(
        regular,
        { pickup: 'unknown', dropOff: '0' },
        true,
      ),
    ).toThrow();
  });

  it('rejects partial family policies rather than silently losing source trips', () => {
    const inputs = fixture();
    inputs.context.tables['routes.txt'].push({
      route_id: 'NSL_TEST',
      agency_id: 'SBST',
      route_type: '1',
    });
    inputs.context.tables['trips.txt'].push({
      route_id: 'NSL_TEST',
      service_id: 'WD',
      trip_id: 'OTHER',
      direction_id: '0',
    });
    inputs.context.tables['stop_times.txt'].push(
      ...['P', 'Q'].map((stop_id, index) => ({
        trip_id: 'OTHER',
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: '08:00:00',
        departure_time: '08:00:00',
      })),
    );
    expect(() => createScheduledPlatformAssociationReview(inputs)).toThrow(
      /complete capture family coverage/,
    );
  });
});
