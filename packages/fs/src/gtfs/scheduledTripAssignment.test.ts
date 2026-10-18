import { describe, expect, it } from 'vitest';
import type { ScheduleTables } from './schedule.js';
import {
  type ScheduledTripPatternAssignment,
  validateScheduledTripPatternAssignments,
} from './scheduledTripAssignment.js';
import type { scheduleTopologyProjection } from './topology.js';

function fixture() {
  const tables: ScheduleTables = {
    'agency.txt': [{ agency_id: 'SOURCE', agency_timezone: 'Asia/Singapore' }],
    'routes.txt': [{ route_id: 'R', agency_id: 'SOURCE' }],
    'trips.txt': ['T', 'T2'].map((trip_id) => ({
      trip_id,
      route_id: 'R',
      service_id: 'C',
    })),
    'calendar_dates.txt': ['20260101', '20260103', '20260104'].map((date) => ({
      service_id: 'C',
      date,
      exception_type: '1',
    })),
    'stops.txt': [
      { stop_id: 'parent-S', stop_code: 'S', location_type: '1' },
      {
        stop_id: 'P',
        stop_code: 'S',
        parent_station: 'parent-S',
        platform_code: 'B / A',
      },
      { stop_id: 'Q', stop_code: 'D', platform_code: 'Q' },
    ],
    'stop_times.txt': ['T', 'T2'].flatMap((trip_id) =>
      ['P', 'Q'].map((stop_id, index) => ({
        trip_id,
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: '25:00:00',
        departure_time: '25:00:00',
        pickup_type: '1',
        drop_off_type: '3',
      })),
    ),
  };
  const topology: ReturnType<typeof scheduleTopologyProjection> = {
    projectionVersion: 1,
    operators: [{ id: 'OP' }],
    lines: [
      {
        id: 'L',
        type: 'lrt',
        serviceIds: ['SVC'],
        operators: [{ operatorId: 'OP', startedAt: null, endedAt: null }],
      },
    ],
    services: [
      {
        id: 'SVC',
        lineId: 'L',
        revisions: ['r1', 'r2'].map((id) => ({
          id,
          startAt: id === 'r1' ? '2020-01-01' : '2026-01-03',
          endAt: id === 'r1' ? '2026-01-03' : null,
          stations: ['S', 'D'].map((stationId) => ({
            stationId,
            displayCode: stationId,
          })),
        })),
      },
    ],
    stations: ['S', 'D'].map((id) => ({
      id,
      stationCodes: [
        { lineId: 'L', code: id, startedAt: '2020-01-01', endedAt: null },
      ],
      platforms: (id === 'S' ? ['A', 'B'] : ['Q']).map((platformId) => ({
        id: platformId,
        label: platformId,
        lineId: 'L',
        serviceIds: [],
        boardingStatus: id === 'S' ? 'alighting_only' : null,
      })),
    })),
  };
  const assignment = (
    serviceDates: string[],
    revisionId: string,
    providerTripId: string,
  ): ScheduledTripPatternAssignment => ({
    routeMapping: {
      providerRouteId: 'R',
      providerAgencyId: 'SOURCE',
      lineId: 'L',
      operatorId: 'OP',
    },
    scope: {
      serviceDates,
      binding: {
        providerTripId,
        pattern: {
          lineId: 'L',
          serviceId: 'SVC',
          revisionId,
          destinationStationId: 'D',
          stops: [
            { stationId: 'S', platformIds: ['B', 'A'] },
            { stationId: 'D', platformIds: ['Q'] },
          ],
        },
        occurrences: [
          { providerStopId: 'P', stopSequence: '1' },
          { providerStopId: 'Q', stopSequence: '2' },
        ],
      },
    },
  });
  const assignments = [
    assignment(['2026-01-01'], 'r1', 'T'),
    assignment(['2026-01-04', '2026-01-03'], 'r2', 'T'),
    assignment(['2026-01-01'], 'r1', 'T2'),
  ];
  return { tables, topology, assignments };
}

describe('validateScheduledTripPatternAssignments', () => {
  it('validates disjoint revisions and multiple trips together, retaining complete platform sets and leaving inputs unchanged', () => {
    const { tables, topology, assignments } = fixture();
    const before = JSON.stringify({ tables, topology, assignments });
    const result = validateScheduledTripPatternAssignments(
      tables,
      assignments,
      topology,
    );
    expect(
      result.map(({ scope }) => [
        scope.binding.providerTripId,
        scope.binding.pattern.revisionId,
        scope.serviceDates,
      ]),
    ).toEqual([
      ['T', 'r1', ['2026-01-01']],
      ['T', 'r2', ['2026-01-03', '2026-01-04']],
      ['T2', 'r1', ['2026-01-01']],
    ]);
    expect(
      result.every(
        ({ scope }) =>
          scope.binding.pattern.stops[0].platformIds.join() === 'A,B',
      ),
    ).toBe(true);
    expect(JSON.stringify({ tables, topology, assignments })).toBe(before);
  });

  it('rejects overlaps, inactive dates and mismatched literal bindings across the complete assignment set', () => {
    const changes: [string, (input: ReturnType<typeof fixture>) => void][] = [
      [
        'Overlapping binding service date',
        ({ assignments }) => {
          assignments.push(structuredClone(assignments[1]));
        },
      ],
      [
        'is inactive',
        ({ assignments }) => {
          assignments[0].scope.serviceDates.push('2026-01-02');
        },
      ],
      [
        'source occurrence 0 differs',
        ({ assignments }) => {
          assignments[0].scope.binding.occurrences[0].stopSequence = '01';
        },
      ],
      [
        'Missing source trip',
        ({ assignments }) => {
          assignments[2].scope.binding.providerTripId = 'MISSING';
        },
      ],
      [
        'calendar exception UNUSED:bad: invalid date',
        ({ tables }) => {
          tables['calendar_dates.txt'].push({
            service_id: 'UNUSED',
            date: 'bad',
            exception_type: '1',
          });
        },
      ],
    ];
    for (const [message, change] of changes) {
      const input = fixture();
      change(input);
      expect(() =>
        validateScheduledTripPatternAssignments(
          input.tables,
          input.assignments,
          input.topology,
        ),
      ).toThrow(message);
    }
  });

  it('requires the same assignments to pass source-stop, canonical-date, boarding and operator checks', () => {
    const changes: [string, (input: ReturnType<typeof fixture>) => void][] = [
      [
        'Source parent parent-S does not uniquely identify S',
        ({ tables }) => {
          tables['stops.txt'][0].stop_code = 'D';
        },
      ],
      [
        'complete canonical platform set',
        ({ assignments }) => {
          assignments[0].scope.binding.pattern.stops[0].platformIds = ['A'];
        },
      ],
      [
        'is inactive',
        ({ assignments }) => {
          assignments[1].scope.binding.pattern.revisionId = 'r1';
        },
      ],
      [
        'conflicts with platform B',
        ({ topology }) => {
          topology.stations[0].platforms[1].boardingStatus = 'not_in_service';
        },
      ],
      [
        'does not use route',
        ({ assignments }) => {
          assignments[0].routeMapping.providerRouteId = 'OTHER';
        },
      ],
      [
        'does not cover line',
        ({ topology }) => {
          topology.lines[0].operators[0].endedAt = '2026-01-01';
        },
      ],
    ];
    for (const [message, change] of changes) {
      const input = fixture();
      change(input);
      expect(() =>
        validateScheduledTripPatternAssignments(
          input.tables,
          input.assignments,
          input.topology,
        ),
      ).toThrow(message);
    }
  });
});
