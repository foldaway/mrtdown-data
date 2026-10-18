import { describe, expect, it } from 'vitest';
import type { ScheduleTables } from './schedule.js';
import {
  ScheduledRouteMappingSchema,
  validateScheduledTripPatternSourceRoute,
} from './scheduledTripRoute.js';
import type { scheduleTopologyProjection } from './topology.js';

function fixture() {
  const mapping = {
    providerRouteId: '009007199254740993',
    lineId: 'L',
    providerAgencyId: 'SOURCE',
    operatorId: 'OP',
  };
  const scope = {
    serviceDates: ['2026-01-03', '2026-01-01'],
    binding: {
      providerTripId: '000T',
      pattern: {
        lineId: 'L',
        serviceId: 'SVC',
        revisionId: 'r1',
        destinationStationId: 'D',
        stops: ['S', 'D'].map((stationId) => ({
          stationId,
          platformIds: ['A'],
        })),
      },
      occurrences: ['P', 'Q'].map((providerStopId, index) => ({
        providerStopId,
        stopSequence: String(index + 1),
      })),
    },
  };
  const tables: ScheduleTables = {
    'trips.txt': [
      { trip_id: '000T', route_id: mapping.providerRouteId, service_id: 'C' },
    ],
    'routes.txt': [{ route_id: mapping.providerRouteId, agency_id: 'SOURCE' }],
    'agency.txt': [{ agency_id: 'SOURCE' }],
  };
  const topology: ReturnType<typeof scheduleTopologyProjection> = {
    projectionVersion: 1,
    operators: [{ id: 'OP' }, { id: 'OTHER' }],
    lines: [
      {
        id: 'L',
        type: 'lrt',
        serviceIds: ['SVC'],
        operators: [
          { operatorId: 'OP', startedAt: '2026-01-01', endedAt: '2026-01-04' },
        ],
      },
    ],
    services: [
      {
        id: 'SVC',
        lineId: 'L',
        revisions: [
          {
            id: 'r1',
            startAt: '2020-01-01',
            endAt: null,
            stations: ['S', 'D'].map((stationId) => ({
              stationId,
              displayCode: stationId,
            })),
          },
        ],
      },
    ],
    stations: ['S', 'D'].map((id) => ({
      id,
      stationCodes: [
        { code: id, lineId: 'L', startedAt: '2020-01-01', endedAt: null },
      ],
      platforms: [
        {
          id: 'A',
          label: 'A',
          lineId: 'L',
          serviceIds: [],
          boardingStatus: null,
        },
      ],
    })),
  };
  return { mapping, scope, tables, topology };
}

describe('validateScheduledTripPatternSourceRoute', () => {
  it('checks literal source aliases and every scoped date across open operator periods without changing inputs', () => {
    const { mapping, scope, tables, topology } = fixture();
    topology.lines[0].operators = [
      { operatorId: 'OP', startedAt: null, endedAt: '2026-01-02' },
      { operatorId: 'OP', startedAt: '2026-01-03', endedAt: null },
    ];
    const before = JSON.stringify({ mapping, scope, tables, topology });
    expect(
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).toEqual({
      ...scope,
      serviceDates: ['2026-01-01', '2026-01-03'],
    });
    expect(JSON.stringify({ mapping, scope, tables, topology })).toBe(before);
    scope.serviceDates.push('2026-01-02');
    expect(() =>
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).toThrow('on 2026-01-02');
  });

  it('uses inclusive starts and exclusive ends, and rejects malformed matching periods even when another period covers the dates', () => {
    const { mapping, scope, tables, topology } = fixture();
    expect(() =>
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).not.toThrow();
    for (const date of ['2025-12-31', '2026-01-04']) {
      expect(() =>
        validateScheduledTripPatternSourceRoute(
          { ...scope, serviceDates: [date] },
          tables,
          mapping,
          topology,
        ),
      ).toThrow(`on ${date}`);
    }
    const malformed = {
      operatorId: 'OP',
      startedAt: '2026-02-30',
      endedAt: null,
    };
    topology.lines[0].operators.push(malformed);
    for (const bounds of [
      { startedAt: '2026-02-30', endedAt: null },
      { startedAt: '2026-01-01T00:00:00Z', endedAt: null },
      { startedAt: '2026-01-03', endedAt: '2026-01-02' },
      { startedAt: '2026-01-03', endedAt: '2026-01-03' },
    ]) {
      Object.assign(malformed, bounds);
      expect(() =>
        validateScheduledTripPatternSourceRoute(
          scope,
          tables,
          mapping,
          topology,
        ),
      ).toThrow();
    }
  });

  it('requires one source record at every link from trip through route to agency', () => {
    for (const table of ['trips.txt', 'routes.txt', 'agency.txt']) {
      for (const duplicate of [false, true]) {
        const { mapping, scope, tables, topology } = fixture();
        if (duplicate) {
          tables[table].push({ ...tables[table][0] });
        } else {
          tables[table] = [];
        }
        expect(() =>
          validateScheduledTripPatternSourceRoute(
            scope,
            tables,
            mapping,
            topology,
          ),
        ).toThrow(`found ${duplicate ? 2 : 0}`);
      }
    }
    const { mapping, scope, tables, topology } = fixture();
    tables['trips.txt'][0].trip_id = 'T';
    expect(() =>
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).toThrow('source trip: 000T');
  });

  it('rejects conflicting route, agency, line or operator assignments without guessing replacements', () => {
    const { mapping, scope, tables, topology } = fixture();
    for (const change of [
      { providerRouteId: '9007199254740993' },
      { providerAgencyId: 'OTHER' },
      { lineId: 'OTHER' },
      { operatorId: 'OTHER' },
      { operatorId: 'MISSING' },
    ]) {
      expect(() =>
        validateScheduledTripPatternSourceRoute(
          scope,
          tables,
          { ...mapping, ...change },
          topology,
        ),
      ).toThrow();
    }
    tables['routes.txt'][0].agency_id = '';
    expect(() =>
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).toThrow('does not use agency');
    tables['routes.txt'][0].agency_id = 'SOURCE';
    topology.operators.push({ id: 'OP' });
    expect(() =>
      validateScheduledTripPatternSourceRoute(scope, tables, mapping, topology),
    ).toThrow('canonical operator: OP; found 2');
    expect(
      ScheduledRouteMappingSchema.safeParse({ ...mapping, approved: true })
        .success,
    ).toBe(false);
  });
});
