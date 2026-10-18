import { describe, expect, it } from 'vitest';
import {
  validateScheduledTripPatternDateScope,
  validateScheduledTripPatternReferences,
} from './scheduledTripPattern.js';
import type { scheduleTopologyProjection } from './topology.js';

function topology(): ReturnType<typeof scheduleTopologyProjection> {
  return {
    projectionVersion: 1,
    operators: [],
    lines: [{ id: 'L', type: 'lrt', serviceIds: ['LOOP'], operators: [] }],
    services: [
      {
        id: 'LOOP',
        lineId: 'L',
        revisions: [
          {
            id: 'r1',
            startAt: '2020-01-01',
            endAt: null,
            stations: ['S', 'D', 'S'].map((stationId) => ({
              stationId,
              displayCode: stationId,
            })),
          },
        ],
      },
    ],
    stations: ['S', 'D', 'UNUSED'].map((id) => ({
      id,
      stationCodes: [],
      platforms: (id === 'S' ? ['A', 'B'] : ['Q']).map((platformId) => ({
        id: platformId,
        label: platformId,
        lineId: 'L',
        serviceIds: [],
        boardingStatus: null,
      })),
    })),
  };
}

function pattern() {
  return {
    lineId: 'L',
    serviceId: 'LOOP',
    revisionId: 'r1',
    destinationStationId: 'S',
    stops: [
      { stationId: 'S', platformIds: ['B', 'A'] },
      { stationId: 'D', platformIds: ['Q'] },
      { stationId: 'S', platformIds: ['A', 'B'] },
    ],
  };
}

function datedTopology() {
  const canonical = topology();
  const revision = canonical.services[0].revisions[0];
  revision.startAt = '2026-01-01';
  revision.endAt = '2026-01-04';
  for (const station of canonical.stations) {
    station.stationCodes = [
      {
        lineId: 'L',
        code: station.id,
        startedAt: '2026-01-01',
        endedAt: '2026-01-04',
      },
    ];
  }
  return canonical;
}

function scope(
  stationIds = ['S', 'D', 'S'],
  serviceDates = ['2026-01-01', '2026-01-03'],
) {
  return {
    serviceDates,
    binding: {
      providerTripId: 'T',
      pattern: {
        ...pattern(),
        destinationStationId: stationIds.at(-1),
        stops: stationIds.map((stationId) => ({
          stationId,
          platformIds: stationId === 'S' ? ['B', 'A'] : ['Q'],
        })),
      },
      occurrences: stationIds.map((stationId, index) => ({
        providerStopId: `source-${stationId}`,
        stopSequence: String(index + 1),
      })),
    },
  };
}

describe('validateScheduledTripPatternDateScope', () => {
  it('accepts full paths, short workings and single-circuit loop rotations without changing identity or inputs', () => {
    const canonical = datedTopology();
    const before = JSON.stringify(canonical);
    for (const stations of [
      ['S', 'D', 'S'],
      ['S', 'D'],
      ['D', 'S', 'D'],
    ]) {
      const input = scope(stations);
      const original = JSON.stringify(input);
      const result = validateScheduledTripPatternDateScope(input, canonical);
      expect(
        result.binding.pattern.stops.map((stop) => stop.stationId),
      ).toEqual(stations);
      expect(
        result.binding.pattern.stops.find((stop) => stop.stationId === 'S')
          ?.platformIds,
      ).toEqual(['A', 'B']);
      expect(JSON.stringify(input)).toBe(original);
    }
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it('checks every date against inclusive starts, exclusive ends and the revision display codes on the correct line', () => {
    for (const date of ['2025-12-31', '2026-01-04']) {
      expect(() =>
        validateScheduledTripPatternDateScope(
          scope(['S', 'D'], [date]),
          datedTopology(),
        ),
      ).toThrow('is inactive');
    }
    for (const change of [
      { endedAt: '2026-01-03' },
      { code: 'OTHER' },
      { lineId: 'OTHER' },
    ]) {
      const canonical = datedTopology();
      Object.assign(canonical.stations[0].stationCodes[0], change);
      expect(() =>
        validateScheduledTripPatternDateScope(scope(), canonical),
      ).toThrow('has active station codes');
    }
  });

  it('rejects unordered paths, rotation of open paths and more than one canonical circuit', () => {
    expect(() =>
      validateScheduledTripPatternDateScope(scope(['S', 'S']), datedTopology()),
    ).toThrow('outside the ordered path');
    expect(() =>
      validateScheduledTripPatternDateScope(
        scope(['S', 'D', 'S', 'D', 'S']),
        datedTopology(),
      ),
    ).toThrow('outside the ordered path');
    const canonical = datedTopology();
    canonical.services[0].revisions[0].stations = ['S', 'D', 'UNUSED'].map(
      (stationId) => ({ stationId, displayCode: stationId }),
    );
    expect(() =>
      validateScheduledTripPatternDateScope(scope(['D', 'S']), canonical),
    ).toThrow('outside the ordered path');
  });

  it('requires one whole alignment per date rather than mixing code evidence from different repeated-station segments', () => {
    const canonical = datedTopology();
    canonical.services[0].revisions[0].stations = [
      { stationId: 'S', displayCode: 'S1' },
      { stationId: 'D', displayCode: 'D1' },
      { stationId: 'S', displayCode: 'S2' },
      { stationId: 'D', displayCode: 'D2' },
    ];
    canonical.stations[0].stationCodes = [
      { lineId: 'L', code: 'S1', startedAt: '2026-01-01', endedAt: null },
      { lineId: 'L', code: 'S2', startedAt: '2026-01-03', endedAt: null },
    ];
    canonical.stations[1].stationCodes = [
      {
        lineId: 'L',
        code: 'D1',
        startedAt: '2026-01-01',
        endedAt: '2026-01-02',
      },
      { lineId: 'L', code: 'D2', startedAt: '2026-01-01', endedAt: null },
    ];
    const input = scope(['S', 'D'], ['2026-01-02']);
    expect(() =>
      validateScheduledTripPatternDateScope(input, canonical),
    ).toThrow('has active station codes');
    canonical.stations[0].stationCodes[1].startedAt = '2026-01-02';
    expect(
      validateScheduledTripPatternDateScope(input, canonical).serviceDates,
    ).toEqual(['2026-01-02']);
    canonical.stations[0].stationCodes[0].startedAt = '2026-02-30';
    expect(() =>
      validateScheduledTripPatternDateScope(input, canonical),
    ).toThrow();
  });
});

describe('validateScheduledTripPatternReferences', () => {
  it('retains every platform alternative and repeated station visit without modifying the canonical projection', () => {
    const canonical = topology();
    canonical.stations[0].platforms[0].serviceIds = ['LOOP'];
    const before = JSON.stringify(canonical);
    const result = validateScheduledTripPatternReferences(pattern(), canonical);
    expect(result.stops.map((stop) => stop.stationId)).toEqual(['S', 'D', 'S']);
    expect(result.stops[0].platformIds).toEqual(['A', 'B']);
    const shortWorking = {
      ...pattern(),
      destinationStationId: 'D',
      stops: pattern().stops.slice(0, 2),
    };
    expect(
      validateScheduledTripPatternReferences(shortWorking, canonical),
    ).toEqual({ ...shortWorking, stops: result.stops.slice(0, 2) });
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it('rejects dangling identities, including the destination and every member of a platform set', () => {
    for (const field of ['lineId', 'serviceId', 'revisionId'] as const) {
      expect(() =>
        validateScheduledTripPatternReferences(
          { ...pattern(), [field]: 'MISSING' },
          topology(),
        ),
      ).toThrow('found 0');
    }
    const value = pattern();
    value.destinationStationId = 'MISSING';
    value.stops[2].stationId = 'MISSING';
    expect(() =>
      validateScheduledTripPatternReferences(value, topology()),
    ).toThrow('canonical station: MISSING');
    value.stops[2].stationId = 'S';
    value.destinationStationId = 'S';
    value.stops[0].platformIds.push('MISSING');
    expect(() =>
      validateScheduledTripPatternReferences(value, topology()),
    ).toThrow('platform at station S: MISSING');
  });

  it('rejects references to the wrong line, service revision, station or platform service scope', () => {
    const canonical = topology();
    canonical.services[0].lineId = 'OTHER';
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('does not belong');
    canonical.services[0].lineId = 'L';
    canonical.lines[0].serviceIds = [];
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('does not belong');
    canonical.lines[0].serviceIds = ['LOOP'];
    const value = pattern();
    value.stops[1].stationId = 'UNUSED';
    expect(() =>
      validateScheduledTripPatternReferences(value, canonical),
    ).toThrow('outside service revision');
    const platform = canonical.stations[0].platforms[1];
    platform.lineId = 'OTHER';
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('outside line');
    platform.lineId = 'L';
    platform.serviceIds = ['OTHER'];
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('excludes service');
    platform.serviceIds = [];
    value.stops[0].platformIds = ['Q'];
    expect(() =>
      validateScheduledTripPatternReferences(value, canonical),
    ).toThrow('platform at station S: Q');
  });

  it('refuses ambiguous canonical identities instead of selecting the first record', () => {
    const canonical = topology();
    canonical.services[0].revisions.push({
      ...canonical.services[0].revisions[0],
    });
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('found 2');
    canonical.services[0].revisions.pop();
    canonical.stations[0].platforms.push({
      ...canonical.stations[0].platforms[0],
    });
    expect(() =>
      validateScheduledTripPatternReferences(pattern(), canonical),
    ).toThrow('found 2');
  });
});
