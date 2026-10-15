import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import {
  checkReconciliationReview,
  proposeScheduleReconciliation,
  type ReconciliationIdentity,
} from './reconciliation.js';
import type { ScheduleTables } from './schedule.js';
import type { scheduleTopologyProjection } from './topology.js';

type Topology = ReturnType<typeof scheduleTopologyProjection>;
function fixture() {
  const tables: ScheduleTables = {
    'agency.txt': [{ agency_id: 'SMRT' }, { agency_id: 'LTA' }],
    'routes.txt': [
      { route_id: 'NSL_NS1_NS2', agency_id: 'SMRT', route_type: '1' },
    ],
    'stops.txt': [
      { stop_id: 'S', stop_code: 'NS1', location_type: '1' },
      {
        stop_id: 'P',
        stop_code: 'NS1',
        location_type: '0',
        parent_station: 'S',
        platform_code: 'A',
      },
      { stop_id: 'D', stop_code: 'NS2', location_type: '1' },
      {
        stop_id: 'Q',
        stop_code: 'NS2',
        location_type: '0',
        parent_station: 'D',
        platform_code: 'B',
      },
      { stop_id: 'UNUSED_ENTRANCE', location_type: '2', parent_station: 'S' },
    ],
    'calendar.txt': [
      {
        service_id: 'C',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '1',
        sunday: '1',
        start_date: '20260101',
        end_date: '20261231',
      },
    ],
    'trips.txt': [
      {
        route_id: 'NSL_NS1_NS2',
        service_id: 'C',
        trip_id: 'T',
        direction_id: '0',
      },
    ],
    'stop_times.txt': [
      {
        trip_id: 'T',
        stop_id: 'P',
        stop_sequence: '1',
        arrival_time: '08:00:00',
        departure_time: '08:00:00',
      },
      {
        trip_id: 'T',
        stop_id: 'Q',
        stop_sequence: '2',
        arrival_time: '08:02:00',
        departure_time: '08:02:00',
      },
    ],
  };
  const topology = {
    projectionVersion: 1,
    operators: [{ id: 'SMRT_TRAINS' }],
    lines: [
      { id: 'NSL', type: 'mrt', serviceIds: ['SVC'], operators: [] },
      { id: 'CRL', type: 'mrt', serviceIds: [], operators: [] },
    ],
    stations: ['S', 'D'].map((id, index) => ({
      id,
      stationCodes: [
        {
          lineId: 'NSL',
          code: `NS${index + 1}`,
          startedAt: '2000-01-01',
          endedAt: null,
        },
      ],
      platforms: [
        {
          id: `platform-${id}`,
          label: index ? 'B' : 'A',
          lineId: 'NSL',
          serviceIds: ['SVC'],
          boardingStatus: null,
        },
      ],
    })),
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
  } as unknown as Topology;
  const identity: ReconciliationIdentity = {
    sourceManifest: { 'stops.txt': 'a'.repeat(64) },
    canonicalCommit: 'b'.repeat(40),
    topology: {
      projectionVersion: 1,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  };
  return { tables, topology, identity };
}
function proposal() {
  const { tables, topology, identity } = fixture();
  return proposeScheduleReconciliation(tables, identity, topology);
}
function reviewed() {
  const report = proposal();
  return {
    report,
    review: {
      schemaVersion: 1 as const,
      identity: report.identity,
      decisions: report.entries.map((entry) => ({
        kind: entry.kind,
        providerId: entry.providerId,
        sourceRecordSha256: entry.sourceRecordSha256,
        disposition: entry.candidates.length
          ? ('matched' as const)
          : ('ignored' as const),
        ...(entry.candidates[0] ? { target: entry.candidates[0] } : {}),
        reviewer: 'Fixture reviewer',
        reason: 'Synthetic reviewed scope',
      })),
    },
  };
}

describe('GTFS reconciliation proposals and review gate', () => {
  it('proposes aliases, parent-inclusive platform coverage, and exact ordered service matches without approval', () => {
    const report = proposal();
    expect(report.generationEligible).toBe(false);
    expect(
      report.entries.find(
        (entry) => entry.kind === 'agency' && entry.providerId === 'LTA',
      )?.status,
    ).toBe('unresolved');
    expect(
      report.entries
        .filter((entry) => entry.kind === 'stop')
        .map((entry) => entry.providerId),
    ).toEqual(['D', 'P', 'Q', 'S']);
    expect(
      report.entries.find((entry) => entry.kind === 'pattern')?.candidates,
    ).toEqual([
      { kind: 'serviceRevision', id: 'SVC', revisionId: 'R', match: 'exact' },
    ]);
    expect(report.canonicalLinesAbsentFromSchedule).toEqual(['CRL']);
  });
  it('is byte deterministic under CSV row and object-key reordering', () => {
    const { tables, topology, identity } = fixture();
    for (const rows of Object.values(tables)) rows.reverse();
    const reordered = Object.fromEntries(
      Object.entries(tables)
        .reverse()
        .map(([name, rows]) => [
          name,
          rows.map((row) => Object.fromEntries(Object.entries(row).reverse())),
        ]),
    );
    expect(
      JSON.stringify(
        proposeScheduleReconciliation(reordered, identity, topology),
      ),
    ).toBe(JSON.stringify(proposal()));
  });
  it('keeps grouped platform labels ambiguous and conflicting parent codes unresolved', () => {
    const { tables, topology, identity } = fixture();
    const platform = tables['stops.txt']?.find((row) => row.stop_id === 'P');
    if (!platform) throw new Error('missing fixture');
    platform.platform_code = 'A / X';
    topology.stations[0]?.platforms.push({
      ...topology.stations[0].platforms[0],
      id: 'other',
      label: 'X',
    } as Topology['stations'][number]['platforms'][number]);
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    expect(
      proposeScheduleReconciliation(tables, identity, topology).entries.find(
        (entry) => entry.providerId === 'P',
      )?.status,
    ).toBe('ambiguous');
    platform.parent_station = 'D';
    expect(
      proposeScheduleReconciliation(tables, identity, topology).entries.find(
        (entry) => entry.providerId === 'P',
      )?.status,
    ).toBe('unresolved');
  });
  it('preserves repeated station occurrences rather than collapsing a loop', () => {
    const { tables, topology, identity } = fixture();
    tables['stop_times.txt']?.push({
      trip_id: 'T',
      stop_id: 'P',
      stop_sequence: '3',
      arrival_time: '08:04:00',
      departure_time: '08:04:00',
    });
    expect(
      proposeScheduleReconciliation(tables, identity, topology).entries.find(
        (entry) => entry.kind === 'pattern',
      )?.status,
    ).toBe('unresolved');
  });
  it('rejects invalid structural inputs and topology identity mismatch', () => {
    const { tables, topology, identity } = fixture();
    expect(() =>
      proposeScheduleReconciliation(
        tables,
        {
          ...identity,
          topology: { ...identity.topology, sha256: '0'.repeat(64) },
        },
        topology,
      ),
    ).toThrow('fingerprint');
    tables['trips.txt']?.push({ trip_id: 'T', route_id: 'unknown' });
    expect(() =>
      proposeScheduleReconciliation(tables, identity, topology),
    ).toThrow('Structurally invalid');
  });
  it('requires an explicit review of every entry including unused publisher agency and parents', () => {
    const { report, review } = reviewed();
    expect(
      checkReconciliationReview(report, { ...review, decisions: [] })
        .generationEligible,
    ).toBe(false);
    expect(checkReconciliationReview(report, review)).toEqual({
      generationEligible: true,
      errors: [],
    });
    review.decisions.pop();
    expect(
      checkReconciliationReview(report, review).errors.some((error) =>
        error.startsWith('Missing review'),
      ),
    ).toBe(true);
  });
  it('blocks changed provenance, changed records, duplicate reviews, and fabricated targets', () => {
    const { report, review } = reviewed();
    review.identity = { ...review.identity, canonicalCommit: 'c'.repeat(40) };
    const first = review.decisions[0];
    if (!first) throw new Error('missing fixture');
    first.sourceRecordSha256 = 'd'.repeat(64);
    first.disposition = 'matched';
    first.target = { kind: 'operator', id: 'fabricated' };
    review.decisions.push(first);
    const result = checkReconciliationReview(report, review);
    expect(result.generationEligible).toBe(false);
    expect(result.errors.join('\n')).toContain('identity');
    expect(result.errors.join('\n')).toContain('changed record');
    expect(result.errors.join('\n')).toContain('Duplicate review');
    expect(result.errors.join('\n')).toContain('Unrecognized match');
  });
});
