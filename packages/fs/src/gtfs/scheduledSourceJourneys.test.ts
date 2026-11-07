import { describe, expect, it } from 'vitest';
import { holidayFixture } from './__tests__/holidayFixture.js';
import { hashBytes } from './capture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { proposeScheduleReconciliation } from './reconciliation.js';
import { auditSchedule } from './schedule.js';
import { evaluateScheduledHolidayMapping } from './scheduledHolidayMapping.js';
import { resolveScheduledHolidayDates } from './scheduledHolidayPolicy.js';
import { createScheduledPlatformAllocationMappingDraft } from './scheduledPlatformAllocations.js';
import {
  applyScheduledSourceJourneyServiceMemberships,
  createScheduledSourceJourneyMappingDraft,
  evaluateScheduledSourceJourneyMapping,
  scheduledSourceJourneyMappingDraftSha256,
} from './scheduledSourceJourneys.js';
import { validateScheduledTripPatternDateScope } from './scheduledTripPattern.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture value');
  return value;
}

function fixture(sequence = ['P', 'Q', 'P', 'Q']) {
  const { context, policy: holidayPolicy, calendar } = holidayFixture();
  context.tables['routes.txt'] = context.tables['routes.txt'].filter(
    (r) => r.route_id === 'NEL_TEST',
  );
  context.tables['trips.txt'] = context.tables['trips.txt'].filter(
    (r) => r.route_id === 'NEL_TEST',
  );
  context.tables['stop_times.txt'] = context.tables['trips.txt'].flatMap(
    (trip) =>
      sequence.map((stop_id, index) => ({
        trip_id: trip.trip_id,
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: `25:0${index}:00`,
        departure_time: `25:0${index}:30`,
      })),
  );
  context.topology.services[0].revisions[0].stations.splice(1, 0, {
    stationId: 'M',
    displayCode: 'NE2',
  });
  context.topology.stations.push({
    id: 'M',
    stationCodes: [
      { lineId: 'NEL', code: 'NE2', startedAt: '2000-01-01', endedAt: null },
    ],
    platforms: [],
  });
  context.topology.services.push({
    id: 'OTHER',
    lineId: 'NEL',
    revisions: [
      { ...context.topology.services[0].revisions[0], id: 'OTHER-R' },
    ],
  });
  context.topology.lines[0].serviceIds.push('OTHER');
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const platformPolicy = {
    schemaVersion: 1,
    revision: 'synthetic-allocations',
    sourceManifest: context.identity.sourceManifest,
    allocations: [
      {
        providerStopId: 'P',
        stationId: 'S',
        lineId: 'NEL',
        platformCode: 'A',
        serviceIds: ['OTHER'],
        reason: 'Synthetic allocation',
      },
    ],
  };
  const pattern = auditSchedule(context.tables).patterns.find(
    (p) => p.calendarId === 'WD',
  );
  if (!pattern) throw new Error('Missing fixture pattern');
  const policy = {
    schemaVersion: 1,
    revision: 'synthetic-journey',
    sourceManifest: context.identity.sourceManifest,
    passengerCallRule: 'timed-source-occurrences',
    journeys: [
      {
        providerPatternId: pattern.id,
        lineId: 'NEL',
        serviceId: 'SVC',
        serviceDates: ['2026-11-02'],
        reason:
          'Synthetic explicit association from source route and destination',
      },
    ],
  };
  return { context, policy, platformPolicy, holidayPolicy, calendar };
}
function create(f = fixture()) {
  return {
    ...f,
    draft: createScheduledSourceJourneyMappingDraft(
      f.context,
      f.policy,
      f.platformPolicy,
      f.holidayPolicy,
      f.calendar,
    ),
  };
}
type Prepared = ReturnType<typeof create>;
function evaluate(f: Prepared, input: unknown = f.draft, approval?: unknown) {
  return evaluateScheduledSourceJourneyMapping(
    f.context,
    f.policy,
    f.platformPolicy,
    f.holidayPolicy,
    f.calendar,
    input,
    approval,
  );
}
function approval(f: Prepared) {
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-source-journey-mapping-approval',
    identity: f.draft.identity,
    draftSha256: scheduledSourceJourneyMappingDraftSha256(f.draft),
    reviewer: 'Synthetic reviewer',
    reason: 'Synthetic approval',
  };
}

describe('explicit source journey review', () => {
  it.each([
    ['reversal and repeats', ['P', 'Q', 'P', 'Q']],
    ['omitted intermediate station', ['P', 'Q']],
  ])('retains %s and timed passenger calls on exact dates', (_, sequence) => {
    const f = fixture(sequence);
    const before = structuredClone(f);
    const input = create(f);
    expect(f).toEqual(before);
    expect(
      proposeScheduleReconciliation(
        f.context.tables,
        f.context.identity,
        f.context.topology,
      ).entries.find(
        (e) =>
          e.kind === 'pattern' &&
          e.providerId === f.policy.journeys[0].providerPatternId,
      )?.candidates,
    ).toEqual([]);
    const journey = input.draft.journeys[0];
    expect(journey.trips[0].calls.map((c) => c.providerStopId)).toEqual(
      sequence,
    );
    expect(journey.trips[0].calls.every((c) => c.passengerService)).toBe(true);
    expect(journey.trips[0].calls[0]).toMatchObject({
      arrivalSeconds: 90000,
      departureSeconds: 90030,
      pickupType: 0,
      dropOffType: 0,
    });
    expect(journey.trips[0].sourceStopTimes).toEqual(
      f.context.tables['stop_times.txt'].filter(
        (r) => r.trip_id === 'NEL_TEST_WD',
      ),
    );
    const pattern = input.draft.dateReview.patterns.find(
      (p) => p.providerPatternId === f.policy.journeys[0].providerPatternId,
    );
    expect(
      pattern?.reviewCells.find((c) => c.disposition === 'proposed'),
    ).toMatchObject({
      serviceDates: ['2026-11-02'],
      target: { id: 'SVC', match: 'sourceJourney' },
    });
    expect(pattern?.serviceDates.length).toBeGreaterThan(1);
    expect(evaluate(input)).toMatchObject({
      valid: true,
      coverageComplete: true,
      excludedPatternDates: 0,
      approvalMatches: false,
      generationEligible: false,
    });
    expect(evaluate(input).unresolvedPatternDates).toBeGreaterThan(0);
  });
  it('retains complete platform alternatives and their boarding conflict without denying a station passenger call', () => {
    const f = fixture();
    required(
      f.context.tables['stops.txt'].find((r) => r.stop_id === 'P'),
    ).platform_code = 'A / C';
    f.context.topology.stations[0].platforms.push({
      id: 'C',
      label: 'C',
      lineId: 'NEL',
      serviceIds: [],
      boardingStatus: 'not_in_service',
    });
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    // Allocate at the other, single-label platform; grouped labels cannot be narrowed by allocation policy.
    Object.assign(f.platformPolicy.allocations[0], {
      providerStopId: 'Q',
      stationId: 'D',
      platformCode: 'B',
    });
    const input = create(f);
    expect(input.draft.journeys[0].trips[0].calls[0]).toMatchObject({
      passengerService: true,
      platformIds: ['C', 'platform-S'],
      literalPlatformCode: 'A / C',
    });
    const p = required(
      input.draft.dateReview.patterns.find(
        (p) => p.providerPatternId === f.policy.journeys[0].providerPatternId,
      ),
    );
    expect(p.reviewCells.every((c) => c.disposition === 'unresolved')).toBe(
      true,
    );
    expect(
      p.reviewCells.find((c) => c.serviceDates.includes('2026-11-02'))
        ?.blockers,
    ).toContain('platform-or-boarding');
    expect(evaluate(input)).toMatchObject({
      valid: true,
      coverageComplete: true,
      generationEligible: false,
    });
  });
  it('keeps explicit access rules and does not turn a 25-hour call into the following service date', () => {
    const f = fixture();
    f.context.tables['stop_times.txt'][0].pickup_type = '1';
    const input = create(f);
    expect(input.draft.journeys[0].trips[0].calls[0].pickupType).toBe(1);
    expect(input.draft.journeys[0].serviceDates).toEqual(['2026-11-02']);
  });
  it('honors revision and station-code boundaries without selecting a different service by platform preference', () => {
    const f = fixture();
    f.context.topology.services[0].revisions[0].endAt = '2026-11-02';
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    const input = create(f);
    const p = required(
      input.draft.dateReview.patterns.find(
        (p) => p.providerPatternId === f.policy.journeys[0].providerPatternId,
      ),
    );
    expect(p.reviewCells.every((c) => c.disposition === 'unresolved')).toBe(
      true,
    );
    expect(p.candidateEvidence.every((c) => c.target.id === 'SVC')).toBe(true);
    const g = fixture();
    g.context.topology.stations[0].stationCodes[0].endedAt = '2026-11-02';
    g.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(g.context.topology)),
    );
    expect(
      create(g)
        .draft.dateReview.patterns.find(
          (p) => p.providerPatternId === g.policy.journeys[0].providerPatternId,
        )
        ?.reviewCells.every((c) => c.disposition === 'unresolved'),
    ).toBe(true);
  });
  it('retains overlapping dated revisions as ambiguity rather than choosing one', () => {
    const f = fixture();
    f.context.topology.services[0].revisions.push({
      ...f.context.topology.services[0].revisions[0],
      id: 'R2',
    });
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    const input = create(f);
    const p = required(
      input.draft.dateReview.patterns.find(
        (p) => p.providerPatternId === f.policy.journeys[0].providerPatternId,
      ),
    );
    expect(
      p.reviewCells.find((c) => c.serviceDates.includes('2026-11-02'))
        ?.blockers,
    ).toContain('temporal-ambiguity');
    expect(p.reviewCells.every((c) => c.disposition === 'unresolved')).toBe(
      true,
    );
  });
  it.each([
    'manifest',
    'duplicate',
    'outside dates',
    'wrong line',
    'unknown service',
    'missing time',
    'existing geometry',
  ])('rejects %s', (scenario) => {
    const f = fixture();
    if (scenario === 'manifest')
      f.policy.sourceManifest = { 'calendar.txt': 'a'.repeat(64) };
    if (scenario === 'duplicate')
      f.policy.journeys.push({ ...f.policy.journeys[0] });
    if (scenario === 'outside dates')
      f.policy.journeys[0].serviceDates = ['2026-11-09'];
    if (scenario === 'wrong line') f.policy.journeys[0].lineId = 'NSL';
    if (scenario === 'unknown service')
      f.policy.journeys[0].serviceId = 'UNKNOWN';
    if (scenario === 'missing time')
      Object.assign(f.context.tables['stop_times.txt'][0], {
        arrival_time: '',
        departure_time: '',
        timepoint: '0',
      });
    if (scenario === 'existing geometry') {
      f.context.topology.services[0].revisions[0].stations = [
        'S',
        'D',
        'S',
        'D',
      ].map((stationId, i) => ({
        stationId,
        displayCode: i % 2 ? 'NE3' : 'NE1',
      }));
      f.context.identity.topology.sha256 = hashBytes(
        Buffer.from(JSON.stringify(f.context.topology)),
      );
    }
    expect(() => create(f)).toThrow();
  });
  it('binds source evidence, exact dates, repeated occurrences and review text; old wrappers and approvals cannot approve it', () => {
    const input = create();
    const modified = structuredClone(input.draft);
    modified.journeys[0].trips[0].calls.pop();
    expect(evaluate(input, modified).valid).toBe(false);
    const text = structuredClone(input.draft);
    text.mapping.mapping.preparedBy += ' changed';
    expect(evaluate(input, text, approval(input)).approvalMatches).toBe(false);
    const ordinary = createScheduledPlatformAllocationMappingDraft(
      input.context,
      input.platformPolicy,
      input.holidayPolicy,
      input.calendar,
    );
    expect(() => evaluate(input, ordinary)).toThrow();
    expect(() =>
      evaluate(input, input.draft, {
        ...approval(input),
        documentKind: 'gtfs-platform-allocation-mapping-approval',
      }),
    ).toThrow();
    expect(() =>
      evaluateScheduledHolidayMapping(
        input.context,
        input.holidayPolicy,
        input.calendar,
        input.draft.dateReview,
        input.draft.mapping,
      ),
    ).toThrow('stale');
    const changed = structuredClone(input.context);
    changed.tables['stop_times.txt'][0].arrival_time = '24:59:00';
    expect(
      evaluateScheduledSourceJourneyMapping(
        changed,
        input.policy,
        input.platformPolicy,
        input.holidayPolicy,
        input.calendar,
        input.draft,
      ).valid,
    ).toBe(false);
  });
  it('accepts a policy-added holiday on its original service date and binds a distinct approval', () => {
    const f = fixture();
    const population = resolveScheduledHolidayDates(
      f.context,
      f.holidayPolicy,
      f.calendar,
    );
    f.policy.journeys = population.patterns.map((p) => ({
      ...f.policy.journeys[0],
      providerPatternId: p.providerPatternId,
      serviceDates: p.serviceDates,
    }));
    const input = create(f);
    const holiday = input.draft.dateReview.patterns.find(
      (p) => p.providerCalendarId === 'SU',
    );
    expect(holiday?.addedServiceDates).toContain('2026-11-09');
    expect(
      holiday?.reviewCells.every((c) => c.disposition === 'proposed'),
    ).toBe(true);
    expect(evaluate(input)).toMatchObject({
      valid: true,
      readiness: 'unapproved',
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(evaluate(input, input.draft, approval(input))).toMatchObject({
      valid: true,
      approvalMatches: true,
      mappingReviewEligible: true,
      generationEligible: false,
    });
    const stale = structuredClone(input.draft);
    stale.policy.journeys[0].reason += ' changed';
    expect(evaluate(input, stale, approval(input)).valid).toBe(false);
  });
  it('does not share editable source evidence with the verified input tables', () => {
    const input = create();
    const before = structuredClone(input.context.tables);
    input.draft.journeys[0].trips[0].sourceStopTimes[0].departure_time =
      '26:00:00';
    input.draft.journeys[0].trips[0].sourceTrip.trip_headsign = 'changed';
    expect(input.context.tables).toEqual(before);
    expect(evaluate(input).valid).toBe(false);
  });
  it('rejects source-order rules without a separately bound review topology', () => {
    const f = fixture();
    expect(() =>
      proposeScheduleReconciliation(
        f.context.tables,
        f.context.identity,
        f.context.topology,
        f.policy.journeys,
      ),
    ).toThrow('bound into');
    const input = create(f);
    expect(input.draft.identity.reviewTopologySha256).not.toBe(
      input.context.identity.topology.sha256,
    );
  });
  it('retains shared memberships and the complete date population alongside source journeys', () => {
    const f = fixture();
    const outside = holidayFixture().context.tables;
    f.context.tables['routes.txt'].push(
      ...outside['routes.txt'].filter((r) => r.route_id === 'NSL_TEST'),
    );
    f.context.tables['trips.txt'].push(
      ...outside['trips.txt'].filter((r) => r.route_id === 'NSL_TEST'),
    );
    f.context.tables['stop_times.txt'].push(
      ...outside['stop_times.txt'].filter((r) =>
        r.trip_id.startsWith('NSL_TEST_'),
      ),
    );
    f.context.topology.stations
      .find((s) => s.id === 'M')
      ?.platforms.push({
        id: 'platform-M',
        label: 'A',
        lineId: 'NEL',
        serviceIds: ['SVC', 'OTHER'],
        boardingStatus: null,
      });
    f.context.tables['stops.txt'].push(
      { stop_id: 'M', stop_code: 'NE2', location_type: '1' },
      {
        stop_id: 'MID',
        stop_code: 'NE2',
        parent_station: 'M',
        platform_code: 'A',
        location_type: '0',
      },
    );
    f.context.tables['trips.txt'].push({
      trip_id: 'FULL_SU',
      route_id: 'NEL_TEST',
      service_id: 'SU',
      direction_id: '0',
    });
    f.context.tables['stop_times.txt'].push(
      ...['P', 'MID', 'Q'].map((stop_id, index) => ({
        trip_id: 'FULL_SU',
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: `25:0${index}:00`,
        departure_time: `25:0${index}:00`,
      })),
    );
    f.platformPolicy.allocations.push({
      ...f.platformPolicy.allocations[0],
      providerStopId: 'Q',
      stationId: 'D',
      platformCode: 'B',
    });
    f.context.identity.topology.sha256 = hashBytes(
      Buffer.from(JSON.stringify(f.context.topology)),
    );
    const input = create(f);
    const before = structuredClone(input);
    const pattern = required(
      input.draft.dateReview.patterns.find((p) =>
        p.tripIds.includes('FULL_SU'),
      ),
    );
    const claims = {
      schemaVersion: 1,
      documentKind: 'gtfs-shared-service-membership-claims',
      baseDraftSha256: groupedScopedReviewDraftSha256(
        input.draft.mapping.mapping,
      ),
      claims: [
        {
          providerPatternId: pattern.providerPatternId,
          serviceDates: ['2026-11-09'],
          reason:
            'Both independently validated services on an added holiday date',
          target: {
            kind: 'sharedServiceRevisions',
            members: [
              {
                kind: 'serviceRevision',
                id: 'SVC',
                revisionId: 'R',
                match: 'exact',
              },
              {
                kind: 'serviceRevision',
                id: 'OTHER',
                revisionId: 'OTHER-R',
                match: 'exact',
              },
            ],
          },
        },
      ],
    };
    const updated = applyScheduledSourceJourneyServiceMemberships(
      input.context,
      input.policy,
      input.platformPolicy,
      input.holidayPolicy,
      input.calendar,
      input.draft,
      claims,
    );
    expect(evaluate(input, updated)).toMatchObject({
      valid: true,
      coverageComplete: true,
      excludedPatternDates: 0,
      approvalMatches: false,
      mappingReviewEligible: false,
      generationEligible: false,
    });
    expect(evaluate(input, updated, approval(input)).approvalMatches).toBe(
      false,
    );
    const matched = updated.mapping.mapping.decisions.find(
      (d) =>
        d.kind === 'pattern' && d.target?.kind === 'sharedServiceRevisions',
    );
    if (
      matched?.kind !== 'pattern' ||
      matched.target?.kind !== 'sharedServiceRevisions'
    )
      throw new Error('Missing shared target');
    expect(matched.target.members.map((m) => m.id)).toEqual(['OTHER', 'SVC']);
    expect(
      updated.mapping.mapping.dateSets.find((d) => d.id === matched.dateSetId)
        ?.serviceDates,
    ).toEqual(['2026-11-09']);
    expect(updated.dateReview).toEqual(input.draft.dateReview);
    expect(updated.journeys).toEqual(input.draft.journeys);
    const otherDecisions = (mapping: typeof input.draft.mapping.mapping) =>
      mapping.decisions.filter(
        (d) =>
          d.kind !== 'pattern' || d.providerId !== pattern.providerPatternId,
      );
    expect(otherDecisions(updated.mapping.mapping)).toEqual(
      otherDecisions(input.draft.mapping.mapping),
    );
    const unbound = auditSchedule(input.context.tables).patterns.filter(
      (p) => p.routeId === 'NSL_TEST',
    );
    expect(unbound).toHaveLength(3);
    for (const p of unbound) {
      const dates = updated.mapping.mapping.decisions.flatMap((d) =>
        d.kind === 'pattern' && d.providerId === p.id
          ? required(
              updated.mapping.mapping.dateSets.find(
                (s) => s.id === d.dateSetId,
              ),
            ).serviceDates
          : [],
      );
      expect(dates).toEqual(
        required(
          resolveScheduledHolidayDates(
            input.context,
            input.holidayPolicy,
            input.calendar,
          ).patterns.find((r) => r.providerPatternId === p.id),
        ).sourceServiceDates,
      );
    }
    expect(input).toEqual(before);
    const stale = structuredClone(claims);
    stale.baseDraftSha256 = '0'.repeat(64);
    expect(() =>
      applyScheduledSourceJourneyServiceMemberships(
        input.context,
        input.policy,
        input.platformPolicy,
        input.holidayPolicy,
        input.calendar,
        input.draft,
        stale,
      ),
    ).toThrow('do not bind');
  });
  it('does not make canonical assignment validation accept a reversed source path', () => {
    const input = create();
    expect(() =>
      validateScheduledTripPatternDateScope(
        {
          binding: {
            providerTripId: 'NEL_TEST_WD',
            occurrences: input.draft.journeys[0].trips[0].calls.map((c) => ({
              providerStopId: c.providerStopId,
              stopSequence: c.stopSequence,
            })),
            pattern: {
              lineId: 'NEL',
              serviceId: 'SVC',
              revisionId: 'R',
              destinationStationId: 'D',
              stops: input.draft.journeys[0].trips[0].calls.map((c) => ({
                stationId: c.stationId,
                platformIds: c.platformIds,
              })),
            },
          },
          serviceDates: ['2026-11-02'],
        },
        input.context.topology,
      ),
    ).toThrow('outside the ordered path');
  });
});
