import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { compareScheduleSnapshots } from './drift.js';
import {
  checkReconciliationReview,
  proposeScheduleReconciliation,
  type ReconciliationIdentity,
} from './reconciliation.js';
import {
  activeServiceDates,
  buildReconciliationEvidence,
} from './reconciliationEvidence.js';
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
  it('matches a rotated single circuit only for an explicitly closed canonical path', () => {
    const { tables, topology, identity } = fixture();
    const revision = topology.services[0]?.revisions[0];
    if (!revision) throw new Error('missing fixture');
    revision.stations.push({ stationId: 'S', displayCode: 'NS1' });
    const rows = tables['stop_times.txt'];
    if (!rows?.[0] || !rows[1]) throw new Error('missing fixture');
    rows[0].stop_id = 'Q';
    rows[1].stop_id = 'P';
    rows.push({
      ...rows[1],
      stop_id: 'Q',
      stop_sequence: '3',
      arrival_time: '08:04:00',
      departure_time: '08:04:00',
    });
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    expect(
      proposeScheduleReconciliation(tables, identity, topology).entries.find(
        (entry) => entry.kind === 'pattern',
      )?.candidates,
    ).toEqual([
      {
        kind: 'serviceRevision',
        id: 'SVC',
        revisionId: 'R',
        match: 'cyclicSegment',
      },
    ]);
    rows.push({
      ...rows[1],
      stop_sequence: '4',
      arrival_time: '08:06:00',
      departure_time: '08:06:00',
    });
    expect(
      proposeScheduleReconciliation(tables, identity, topology).entries.find(
        (entry) => entry.kind === 'pattern',
      )?.status,
    ).toBe('unresolved');
  });
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

describe('GTFS reconciliation evidence and pairwise drift', () => {
  it('applies exceptions to inclusive calendars in UTC, including exception-only calendars', () => {
    const { tables } = fixture();
    tables['calendar.txt'] = [
      {
        service_id: 'C',
        start_date: '20260101',
        end_date: '20260103',
        thursday: '1',
        friday: '1',
        saturday: '1',
      },
    ];
    tables['calendar_dates.txt'] = [
      { service_id: 'C', date: '20260101', exception_type: '2' },
      { service_id: 'C', date: '20260104', exception_type: '1' },
    ];
    expect(activeServiceDates(tables, 'C')).toEqual([
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    delete tables['calendar.txt'];
    expect(activeServiceDates(tables, 'C')).toEqual(['2026-01-04']);
    expect(() =>
      activeServiceDates(
        {
          'calendar_dates.txt': [
            { service_id: 'C', date: '20260230', exception_type: '1' },
          ],
        },
        'C',
      ),
    ).toThrow('Invalid service date');
  });
  it('reports partial revision coverage instead of approving a matching sequence', () => {
    const { tables, topology, identity } = fixture();
    const revision = topology.services[0]?.revisions[0];
    if (!revision) throw new Error('missing fixture');
    revision.endAt = '2026-07-01';
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const evidence = buildReconciliationEvidence(tables, identity, topology);
    expect(evidence.patterns[0]?.activeDates.count).toBe(365);
    expect(evidence.patterns[0]?.candidates[0]).toMatchObject({
      revisionDateCount: 181,
      fullDateCoverage: false,
    });
    expect(evidence.patterns[0]?.dateScopes).toMatchObject({
      uniqueDateCount: 181,
      uncoveredDateCount: 184,
    });
    expect(evidence.generationEligible).toBe(false);
    expect(
      evidence.agencies.find((agency) => agency.providerId === 'LTA')
        ?.referencedRouteIds,
    ).toEqual([]);
  });
  it('checks station-code effective dates and service platform exclusions independently', () => {
    const { tables, topology, identity } = fixture();
    const code = topology.stations[0]?.stationCodes[0];
    const platform = topology.stations[0]?.platforms[0];
    if (!code || !platform) throw new Error('missing fixture');
    code.startedAt = '2026-02-01';
    platform.serviceIds = ['OTHER'];
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const candidate = buildReconciliationEvidence(tables, identity, topology)
      .patterns[0]?.candidates[0];
    expect(candidate?.fullDateCoverage).toBe(false);
    expect(candidate?.platformConflicts).toEqual([0]);
    expect(candidate?.occurrences[0]?.platforms[0]?.validDateCount).toBe(334);
    const pattern = buildReconciliationEvidence(tables, identity, topology)
      .patterns[0];
    expect(pattern?.dateScopes).toMatchObject({
      uniqueDateCount: 334,
      uncoveredDateCount: 31,
    });
    expect(pattern?.platformDiagnosticScopes).toMatchObject({
      uniqueDateCount: 0,
      uncoveredDateCount: 365,
    });
  });
  it('keeps both sides of a revision boundary and does not fill a station-code validity gap', () => {
    const { tables, topology, identity } = fixture();
    const service = topology.services[0];
    const initial = service?.revisions[0];
    const code = topology.stations[0]?.stationCodes[0];
    if (!service || !initial || !code) throw new Error('missing fixture');
    initial.endAt = '2026-07-12';
    service.revisions.push({
      ...initial,
      id: 'R2',
      startAt: '2026-07-12',
      endAt: null,
    });
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const pattern = buildReconciliationEvidence(tables, identity, topology)
      .patterns[0];
    expect(
      pattern?.candidates.every((candidate) => !candidate.fullDateCoverage),
    ).toBe(true);
    expect(pattern?.dateScopes).toMatchObject({
      uniqueDateCount: 365,
      uncoveredDateCount: 0,
      ambiguousDateCount: 0,
      generationEligible: false,
    });
    expect(
      pattern?.dateScopes.scopes.map((scope) => ({
        start: scope.startDate,
        end: scope.endDateExclusive,
        revision: scope.candidates[0]?.revisionId,
      })),
    ).toEqual([
      { start: '2026-01-01', end: '2026-07-12', revision: 'R' },
      { start: '2026-07-12', end: '2027-01-01', revision: 'R2' },
    ]);
    code.startedAt = '2026-02-01';
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const gapped = buildReconciliationEvidence(tables, identity, topology)
      .patterns[0];
    expect(gapped?.dateScopes).toMatchObject({
      uniqueDateCount: 334,
      uncoveredDateCount: 31,
    });
    expect(gapped?.dateScopes.scopes[0]).toMatchObject({
      status: 'gap',
      startDate: '2026-01-01',
      endDateExclusive: '2026-02-01',
      candidates: [],
    });
  });
  it.each([
    'missing stop code',
    'unknown platform label',
  ])('retains station temporal coverage with %s and unresolved platform allocation', (scenario) => {
    const { tables, topology, identity } = fixture();
    const stop = tables['stops.txt']?.find((row) => row.stop_id === 'P');
    if (!stop) throw new Error('missing fixture');
    if (scenario === 'missing stop code') delete stop.stop_code;
    else stop.platform_code = 'UNKNOWN';
    const evidence = buildReconciliationEvidence(tables, identity, topology);
    const pattern = evidence.patterns[0];
    expect(pattern?.candidates[0]?.occurrences[0]?.platforms).toEqual([]);
    expect(pattern?.dateScopes).toMatchObject({
      uniqueDateCount: 365,
      uncoveredDateCount: 0,
      generationEligible: false,
    });
    expect(pattern?.platformDiagnosticScopes).toMatchObject({
      uniqueDateCount: 0,
      uncoveredDateCount: 365,
      generationEligible: false,
    });
    expect(evidence.generationEligible).toBe(false);
  });
  it('evaluates pickup restrictions at each ordered occurrence rather than across the whole trip', () => {
    const { tables, topology, identity } = fixture();
    const platform = topology.stations[0]?.platforms[0];
    const first = tables['stop_times.txt']?.[0];
    if (!platform || !first) throw new Error('missing fixture');
    platform.serviceIds = [];
    platform.boardingStatus = 'alighting_only';
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    expect(
      buildReconciliationEvidence(tables, identity, topology).patterns[0]
        ?.candidates[0]?.boardingConflicts,
    ).toEqual([0]);
    first.pickup_type = '1';
    expect(
      buildReconciliationEvidence(tables, identity, topology).patterns[0]
        ?.candidates[0]?.boardingConflicts,
    ).toEqual([]);
  });
  it('does not use a service-excluded platform to bypass boarding restrictions', () => {
    const { tables, topology, identity } = fixture();
    const station = topology.stations[0];
    const platform = station?.platforms[0];
    const row = tables['stops.txt']?.find((row) => row.stop_id === 'P');
    if (!station || !platform || !row) throw new Error('missing fixture');
    platform.boardingStatus = 'alighting_only';
    row.platform_code = 'A / X';
    station.platforms.push({
      ...platform,
      id: 'excluded',
      label: 'X',
      serviceIds: ['OTHER'],
      boardingStatus: null,
    });
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const evidence = buildReconciliationEvidence(tables, identity, topology);
    expect(evidence.patterns[0]?.candidates[0]).toMatchObject({
      platformConflicts: [],
      boardingConflicts: [0],
    });
    expect(evidence.generationEligible).toBe(false);
  });
  it('audits and compares consecutive large sequences in the same trip without rounding', () => {
    const { tables, topology, identity } = fixture();
    const rows = tables['stop_times.txt'];
    if (!rows?.[0] || !rows[1]) throw new Error('missing fixture');
    rows[0].stop_sequence = '9007199254740992';
    rows[1].stop_sequence = '9007199254740993';
    rows.reverse();
    const evidence = buildReconciliationEvidence(tables, identity, topology);
    expect(evidence.patterns[0]?.stopIds).toEqual(['P', 'Q']);
    const next = structuredClone(tables);
    const occurrence = next['stop_times.txt']?.find(
      (row) => row.stop_id === 'Q',
    );
    if (!occurrence) throw new Error('missing fixture');
    occurrence.stop_sequence = '9007199254740994';
    const manifest = { 'stop_times.txt': 'a'.repeat(64) };
    expect(
      compareScheduleSnapshots(
        { tables, manifest },
        { tables: next, manifest },
      ).tables.find((table) => table.name === 'stop_times.txt'),
    ).toMatchObject({
      shared: 1,
      unchanged: 1,
      added: 1,
      removed: 1,
    });
    occurrence.stop_sequence = '09007199254740992';
    expect(() =>
      compareScheduleSnapshots(
        { tables, manifest },
        { tables: next, manifest },
      ),
    ).toThrow('Structurally invalid');
  });
  it('requires one platform option to satisfy both current scope and boarding diagnostics', () => {
    const { tables, topology, identity } = fixture();
    const station = topology.stations[0];
    const platform = station?.platforms[0];
    const row = tables['stops.txt']?.find((row) => row.stop_id === 'P');
    if (!station || !platform || !row) throw new Error('missing fixture');
    row.platform_code = 'A / X';
    platform.serviceIds = ['OTHER'];
    station.platforms.push({
      ...platform,
      id: 'alighting-only',
      label: 'X',
      serviceIds: [],
      boardingStatus: 'alighting_only',
    });
    identity.topology.sha256 = hashBytes(Buffer.from(JSON.stringify(topology)));
    const pattern = buildReconciliationEvidence(tables, identity, topology)
      .patterns[0];
    // An excluded boardable option cannot clear the eligible option's
    // boarding conflict or enable the date-scoped platform diagnostic.
    expect(pattern?.candidates[0]).toMatchObject({
      platformConflicts: [],
      boardingConflicts: [0],
      fullDateCoverage: true,
      fullPlatformDiagnosticCoverage: false,
    });
    expect(pattern?.dateScopes).toMatchObject({
      uniqueDateCount: 365,
      uncoveredDateCount: 0,
    });
    expect(pattern?.platformDiagnosticScopes).toMatchObject({
      uniqueDateCount: 0,
      uncoveredDateCount: 365,
    });
    expect(pattern?.platformDiagnosticScopes.generationEligible).toBe(false);
  });
  it('keeps evidence byte deterministic when row and field order changes', () => {
    const { tables, topology, identity } = fixture();
    const original = buildReconciliationEvidence(tables, identity, topology);
    const reordered = Object.fromEntries(
      Object.entries(tables)
        .reverse()
        .map(([name, rows]) => [
          name,
          rows
            .toReversed()
            .map((row) => Object.fromEntries(Object.entries(row).reverse())),
        ]),
    );
    expect(
      JSON.stringify(
        buildReconciliationEvidence(reordered, identity, topology),
      ),
    ).toBe(JSON.stringify(original));
  });
  it('preserves distinct stop sequence identities beyond the safe integer limit', () => {
    const { tables } = fixture();
    const previous = tables['stop_times.txt']?.[1];
    if (!previous) throw new Error('missing fixture');
    previous.stop_sequence = '9007199254740992';
    const next = structuredClone(tables);
    const changed = next['stop_times.txt']?.[1];
    if (!changed) throw new Error('missing fixture');
    changed.stop_sequence = '09007199254740993';
    const manifest = { 'stop_times.txt': 'a'.repeat(64) };
    const drift = compareScheduleSnapshots(
      { tables, manifest },
      { tables: next, manifest },
    ).tables.find((table) => table.name === 'stop_times.txt');
    expect(drift).toMatchObject({
      unchanged: 1,
      shared: 1,
      added: 1,
      removed: 1,
    });
    expect(drift?.normalizedBeforeSha256).not.toBe(
      drift?.normalizedAfterSha256,
    );
  });
  it('distinguishes retained IDs with changed semantics from unchanged normalized records', () => {
    const { tables } = fixture();
    const next = structuredClone(tables);
    const calendar = next['calendar.txt']?.[0];
    const trip = next['trips.txt']?.[0];
    const stop = next['stops.txt']?.[1];
    if (!calendar || !trip || !stop) throw new Error('missing fixture');
    next['calendar.txt']?.push({ ...calendar, service_id: 'C2' });
    trip.service_id = 'C2';
    stop.platform_code = 'B';
    for (const row of next['stop_times.txt'] ?? []) {
      row.arrival_time = row.arrival_time?.replace(/^08:/, '8:') ?? '';
      row.departure_time = row.departure_time?.replace(/^08:/, '8:') ?? '';
      row.stop_sequence = `0${row.stop_sequence}`;
    }
    const before = { tables, manifest: { 'stops.txt': 'a'.repeat(64) } };
    const after = { tables: next, manifest: { 'stops.txt': 'b'.repeat(64) } };
    const drift = compareScheduleSnapshots(before, after);
    expect(
      drift.tables.find((table) => table.name === 'trips.txt'),
    ).toMatchObject({ shared: 1, changed: 1, fieldChanges: { service_id: 1 } });
    expect(
      drift.tables.find((table) => table.name === 'stops.txt'),
    ).toMatchObject({ changed: 1, fieldChanges: { platform_code: 1 } });
    expect(
      drift.tables.find((table) => table.name === 'stop_times.txt'),
    ).toMatchObject({ unchanged: 2, changed: 0, added: 0, removed: 0 });
    for (const rows of Object.values(next)) rows.reverse();
    expect(compareScheduleSnapshots(before, after)).toEqual(drift);
  });
});
