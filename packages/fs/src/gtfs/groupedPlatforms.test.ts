import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import {
  derivePlatformGroup,
  groupedPlatformDiagnosticsAllow,
  PlatformGroupTargetSchema,
} from './groupedPlatforms.js';
import { buildReconciliationEvidence } from './reconciliationEvidence.js';
import type { ScopedReviewContext } from './scopedReviewContract.js';

function fixture() {
  const source = {
    stop_id: 'P',
    stop_code: 'NS1',
    parent_station: 'S',
    location_type: '0',
    platform_code: 'B / A',
  };
  const platform = (id: string, label: string) => ({
    id,
    label,
    lineId: 'NSL',
    serviceIds: ['SVC'],
    boardingStatus: null,
  });
  const station = {
    id: 'S',
    stationCodes: [
      {
        code: 'NS1',
        lineId: 'NSL',
        startedAt: '2000-01-01',
        endedAt: null,
      },
    ],
    platforms: [platform('P_B', 'B'), platform('P_A', 'A')],
  };
  const context: ScopedReviewContext = {
    tables: {
      'agency.txt': [{ agency_id: 'SMRT' }],
      'routes.txt': [
        { route_id: 'NSL_NS1_NS2', agency_id: 'SMRT', route_type: '1' },
      ],
      'stops.txt': [
        { stop_id: 'S', stop_code: 'NS1', location_type: '1' },
        source,
        { stop_id: 'D', stop_code: 'NS2', location_type: '1' },
        {
          stop_id: 'Q',
          stop_code: 'NS2',
          parent_station: 'D',
          platform_code: 'A',
        },
      ],
      'calendar.txt': [
        {
          service_id: 'C',
          monday: '0',
          tuesday: '0',
          wednesday: '0',
          thursday: '1',
          friday: '0',
          saturday: '0',
          sunday: '0',
          start_date: '20260101',
          end_date: '20260101',
        },
      ],
      'trips.txt': [{ trip_id: 'T', route_id: 'NSL_NS1_NS2', service_id: 'C' }],
      'stop_times.txt': ['P', 'Q'].map((stop_id, index) => ({
        trip_id: 'T',
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: '08:00:00',
        departure_time: '08:00:00',
      })),
    },
    identity: {
      sourceManifest: {},
      canonicalCommit: 'b'.repeat(40),
      topology: { projectionVersion: 1, sha256: 'c'.repeat(64) },
    },
    topology: {
      projectionVersion: 1,
      operators: [{ id: 'SMRT_TRAINS' }],
      lines: [
        {
          id: 'NSL',
          type: 'mrt.high',
          serviceIds: ['SVC'],
          operators: [],
        },
      ],
      stations: [
        station,
        {
          id: 'D',
          stationCodes: [
            {
              code: 'NS2',
              lineId: 'NSL',
              startedAt: '2000-01-01',
              endedAt: null,
            },
          ],
          platforms: [platform('Q_A', 'A')],
        },
      ],
      services: [
        {
          id: 'SVC',
          lineId: 'NSL',
          revisions: [
            {
              id: 'R',
              startAt: '2000-01-01',
              endAt: null,
              stations: [
                { stationId: 'S', displayCode: 'NS1' },
                { stationId: 'D', displayCode: 'NS2' },
              ],
            },
          ],
        },
      ],
    },
  };
  return { context, source, station };
}

function diagnostics(context: ScopedReviewContext) {
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const facts = buildReconciliationEvidence(
    context.tables,
    context.identity,
    context.topology,
  ).patterns[0];
  const target = facts?.candidates[0]?.target;
  const group = derivePlatformGroup(context, 'P');
  if (!facts || !target || !group) throw new Error('Missing fixture facts');
  return { facts, target, groups: new Map([['P', group]]) };
}

describe('literal platform group identities', () => {
  it('normalizes complete groups independently of label and topology order', () => {
    const { context, source, station } = fixture();
    const expected = {
      kind: 'platformGroup',
      stationId: 'S',
      lineId: 'NSL',
      platformIds: ['P_A', 'P_B'],
    };
    expect(derivePlatformGroup(context, 'P')).toEqual(expected);
    source.platform_code = ' A / B ';
    station.platforms.reverse();
    context.tables['stops.txt']?.reverse();
    expect(derivePlatformGroup(context, 'P')).toEqual(expected);
    expect(
      PlatformGroupTargetSchema.parse({
        ...expected,
        platformIds: ['P_B', 'P_A'],
      }),
    ).toEqual(expected);
  });

  it.each([
    { platformIds: ['P_A'] },
    { platformIds: ['P_A', 'P_A'] },
    { platformIds: ['P_A', ''] },
    { stationId: '' },
    { lineId: '' },
    { allocation: 'P_A' },
  ])('rejects malformed or nonliteral group targets: %j', (change) => {
    expect(
      PlatformGroupTargetSchema.safeParse({
        kind: 'platformGroup',
        stationId: 'S',
        lineId: 'NSL',
        platformIds: ['P_A', 'P_B'],
        ...change,
      }).success,
    ).toBe(false);
  });

  it.each([
    'A',
    '',
    'A /',
    '/ A',
    'A // B',
    'A / A',
    'A / B / A',
  ])('rejects nongroups and blank or duplicate literal members: %s', (label) => {
    const { context, source } = fixture();
    source.platform_code = label;
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('preserves every member and rejects an incomplete Ang Mo Kio style group', () => {
    const { context, source } = fixture();
    source.platform_code = 'A / C';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('rejects cross-line platform members and ambiguous code line identities', () => {
    const { context, station } = fixture();
    const member = station.platforms[0];
    if (!member) throw new Error('Missing fixture member');
    member.lineId = 'EWL';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    member.lineId = 'NSL';
    station.stationCodes.push({
      code: 'NS1',
      lineId: 'EWL',
      startedAt: '2000-01-01',
      endedAt: null,
    });
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('rejects two canonical options for one label and reused member IDs', () => {
    const { context, station } = fixture();
    station.platforms.push({
      id: 'P_B_OTHER',
      label: 'B',
      lineId: 'NSL',
      serviceIds: ['SVC'],
      boardingStatus: null,
    });
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    station.platforms.pop();
    const member = station.platforms[0];
    if (!member) throw new Error('Missing fixture member');
    member.id = 'P_A';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('requires a unique physical source row and an exact source code', () => {
    const { context, source } = fixture();
    expect(derivePlatformGroup(context, 'UNKNOWN')).toBeUndefined();
    source.location_type = '1';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    source.location_type = '0';
    source.stop_code = '';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    source.stop_code = 'unknown';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    source.stop_code = 'NS1';
    context.tables['stops.txt']?.push({ ...source });
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('rejects missing, conflicting and ambiguous parent station identities', () => {
    const { context, source, station } = fixture();
    source.parent_station = 'MISSING';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    source.parent_station = 'D';
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
    source.parent_station = 'S';
    context.topology.stations.push({ ...station, id: 'S_OTHER' });
    expect(derivePlatformGroup(context, 'P')).toBeUndefined();
  });

  it('uses the direct code line when a consistent parent has another line code', () => {
    const { context, station } = fixture();
    const parent = context.tables['stops.txt']?.find(
      (row) => row.stop_id === 'S',
    );
    if (!parent) throw new Error('Missing fixture parent');
    parent.stop_code = 'EW1';
    station.stationCodes.push({
      code: 'EW1',
      lineId: 'EWL',
      startedAt: '2000-01-01',
      endedAt: null,
    });
    expect(derivePlatformGroup(context, 'P')?.lineId).toBe('NSL');
  });
});

describe('all-member current platform diagnostics', () => {
  it.each([
    'excluded',
    'not_in_service',
  ])('rejects one %s member even when another member passes', (conflict) => {
    const { context } = fixture();
    const member = context.topology.stations[0]?.platforms[0];
    if (!member) throw new Error('Missing fixture member');
    if (conflict === 'excluded') member.serviceIds = ['OTHER'];
    else member.boardingStatus = 'not_in_service';
    const { facts, target, groups } = diagnostics(context);
    expect(facts.candidates[0]?.platformDiagnosticDateCount).toBe(1);
    expect(groupedPlatformDiagnosticsAllow(facts, target, groups)).toBe(false);
  });

  it('permits unspecified scope without claiming historical permission', () => {
    const { context } = fixture();
    const member = context.topology.stations[0]?.platforms[0];
    if (!member) throw new Error('Missing fixture member');
    member.serviceIds = [];
    const { facts, target, groups } = diagnostics(context);
    expect(groupedPlatformDiagnosticsAllow(facts, target, groups)).toBe(true);
  });

  it('rejects missing options and requires the same service revision target', () => {
    const { context } = fixture();
    const { facts, target, groups } = diagnostics(context);
    expect(
      groupedPlatformDiagnosticsAllow(
        facts,
        { ...target, revisionId: 'OTHER' },
        groups,
      ),
    ).toBe(false);
    facts.candidates[0]?.occurrences[0]?.platforms.pop();
    expect(groupedPlatformDiagnosticsAllow(facts, target, groups)).toBe(false);
    expect(groupedPlatformDiagnosticsAllow(facts, target, new Map())).toBe(
      true,
    );
  });

  it('checks pickup rules for every trip sharing an alighting-only occurrence', () => {
    const { context } = fixture();
    const member = context.topology.stations[0]?.platforms[0];
    const first = context.tables['stop_times.txt']?.[0];
    if (!member || !first) throw new Error('Missing fixture member');
    member.boardingStatus = 'alighting_only';
    let result = diagnostics(context);
    expect(
      groupedPlatformDiagnosticsAllow(
        result.facts,
        result.target,
        result.groups,
      ),
    ).toBe(false);
    first.pickup_type = '1';
    result = diagnostics(context);
    expect(
      groupedPlatformDiagnosticsAllow(
        result.facts,
        result.target,
        result.groups,
      ),
    ).toBe(true);
    context.tables['trips.txt']?.push({
      trip_id: 'T2',
      route_id: 'NSL_NS1_NS2',
      service_id: 'C',
    });
    const secondTrip = context.tables['stop_times.txt']?.map((row) => ({
      ...row,
      trip_id: 'T2',
      pickup_type: '0',
    }));
    context.tables['stop_times.txt']?.push(...(secondTrip ?? []));
    result = diagnostics(context);
    expect(result.facts.tripCount).toBe(2);
    expect(
      groupedPlatformDiagnosticsAllow(
        result.facts,
        result.target,
        result.groups,
      ),
    ).toBe(false);
  });

  it('allows a final alighting-only group but still checks its earlier loop occurrence', () => {
    const { context } = fixture();
    const member = context.topology.stations[0]?.platforms[0];
    const rows = context.tables['stop_times.txt'];
    const revision = context.topology.services[0]?.revisions[0];
    if (!member || !rows?.[0] || !rows[1] || !revision)
      throw new Error('Missing fixture path');
    member.boardingStatus = 'alighting_only';
    rows[0].stop_id = 'Q';
    rows[1].stop_id = 'P';
    revision.stations.reverse();
    let result = diagnostics(context);
    expect(
      groupedPlatformDiagnosticsAllow(
        result.facts,
        result.target,
        result.groups,
      ),
    ).toBe(true);
    rows[0].stop_id = 'P';
    rows[1].stop_id = 'Q';
    rows.push({ ...rows[0], stop_sequence: '3' });
    revision.stations.reverse();
    revision.stations.push({ stationId: 'S', displayCode: 'NS1' });
    result = diagnostics(context);
    expect(result.facts.stopIds).toEqual(['P', 'Q', 'P']);
    expect(
      groupedPlatformDiagnosticsAllow(
        result.facts,
        result.target,
        result.groups,
      ),
    ).toBe(false);
  });
});
