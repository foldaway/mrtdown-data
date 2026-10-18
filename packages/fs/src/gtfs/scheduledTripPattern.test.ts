import {
  bindScheduledTripPattern,
  type ScheduledTripTimes,
} from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import type { CsvRow } from './schedule.js';
import {
  validateScheduledTripPatternBoarding,
  validateScheduledTripPatternDateScope,
  validateScheduledTripPatternReferences,
  validateScheduledTripPatternSourceStops,
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

function sourceFixture() {
  const stops: CsvRow[] = ['S', 'D'].flatMap((id) => [
    { stop_id: `parent-${id}`, stop_code: id, location_type: '1' },
    {
      stop_id: `source-${id}`,
      stop_code: id,
      parent_station: `parent-${id}`,
      platform_code: id === 'S' ? ' B / A ' : 'Q',
    },
  ]);
  return { input: scope(), canonical: datedTopology(), stops };
}

function boardingFixture() {
  const binding = scope().binding;
  const trip: ScheduledTripTimes = {
    providerTripId: 'T',
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes: binding.occurrences.map((occurrence, index) => ({
      ...occurrence,
      providerTripId: 'T',
      arrivalSeconds: index === 1 ? null : 86400 + index * 1800,
      departureSeconds: index === 1 ? null : 86400 + index * 1800,
      pickupType: index === 0 ? 1 : 0,
      dropOffType: 3,
      timepoint: index === 1 ? 0 : 1,
    })),
  };
  return { trip, binding, canonical: topology() };
}

describe('validateScheduledTripPatternBoarding', () => {
  it('preserves source timing and access rules, allowing no-pickup visits and final alighting-only alternatives', () => {
    const { trip, binding, canonical } = boardingFixture();
    canonical.stations[0].platforms[1].boardingStatus = 'alighting_only';
    const before = JSON.stringify({ trip, binding, canonical });
    expect(
      validateScheduledTripPatternBoarding(trip, binding, canonical),
    ).toEqual(bindScheduledTripPattern(trip, binding));
    expect(JSON.stringify({ trip, binding, canonical })).toBe(before);
  });

  it('checks every platform alternative and repeated occurrence, including pickup by arrangement', () => {
    const { trip, binding, canonical } = boardingFixture();
    canonical.stations[0].platforms[1].boardingStatus = 'alighting_only';
    for (const pickup of [0, 2, 3] as const) {
      trip.stopTimes[0].pickupType = pickup;
      expect(() =>
        validateScheduledTripPatternBoarding(trip, binding, canonical),
      ).toThrow('occurrence 0 conflicts with platform B');
    }
    trip.stopTimes[0].pickupType = 1;
    canonical.stations[0].platforms[1].boardingStatus = 'not_in_service';
    expect(() =>
      validateScheduledTripPatternBoarding(trip, binding, canonical),
    ).toThrow('occurrence 0 conflicts with platform B');
    binding.pattern.stops[0].platformIds = ['A'];
    expect(() =>
      validateScheduledTripPatternBoarding(trip, binding, canonical),
    ).toThrow('occurrence 2 conflicts with platform B');
  });

  it('rejects invalid canonical references and mismatched literal source occurrences before returning a result', () => {
    const { trip, binding, canonical } = boardingFixture();
    binding.occurrences[0].stopSequence = '01';
    expect(() =>
      validateScheduledTripPatternBoarding(trip, binding, canonical),
    ).toThrow('source occurrence 0 differs');
    binding.occurrences[0].stopSequence = trip.stopTimes[0].stopSequence;
    canonical.stations[0].platforms[1].serviceIds = ['OTHER'];
    expect(() =>
      validateScheduledTripPatternBoarding(trip, binding, canonical),
    ).toThrow('excludes service');
  });
});

describe('validateScheduledTripPatternSourceStops', () => {
  it('retains complete platform sets and repeated visits, including interchange parents identified through another line', () => {
    const { input, canonical, stops } = sourceFixture();
    canonical.stations[0].stationCodes.push({
      lineId: 'INTERCHANGE',
      code: 'I1',
      startedAt: '2020-01-01',
      endedAt: null,
    });
    stops[0].stop_code = '';
    stops[0].stop_id = 'I1';
    stops[1].parent_station = 'I1';
    const before = JSON.stringify({ input, canonical, stops });
    const result = validateScheduledTripPatternSourceStops(
      input,
      stops,
      canonical,
    );
    expect(result.binding.pattern.stops).toEqual([
      { stationId: 'S', platformIds: ['A', 'B'] },
      { stationId: 'D', platformIds: ['Q'] },
      { stationId: 'S', platformIds: ['A', 'B'] },
    ]);
    expect(result.binding.occurrences).toEqual(input.binding.occurrences);
    expect(JSON.stringify({ input, canonical, stops })).toBe(before);
    stops[1].parent_station = '';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).not.toThrow();
  });

  it('requires child and parent codes to identify the supplied station on every date, with the child on the pattern line', () => {
    const { input, canonical, stops } = sourceFixture();
    const code = {
      lineId: 'L',
      code: 'SOURCE-S',
      startedAt: '2026-01-01',
      endedAt: '2026-01-03',
    };
    canonical.stations[0].stationCodes.push(code);
    stops[1].stop_code = code.code;
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('on 2026-01-03');
    code.endedAt = '2026-01-04';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).not.toThrow();
    code.lineId = 'OTHER';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('does not uniquely identify S');
    code.lineId = 'L';
    stops[0].stop_code = 'D';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('Source station code D');
    stops[0].stop_code = code.code;
    code.startedAt = '2026-01-02';
    stops[1].stop_code = 'S';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('on 2026-01-01');
  });

  it('rejects ambiguous or malformed code periods rather than choosing a convenient match', () => {
    const { input, canonical, stops } = sourceFixture();
    const duplicateCode = { ...canonical.stations[0].stationCodes[0] };
    canonical.stations[2].stationCodes.push(duplicateCode);
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('does not uniquely identify S');
    duplicateCode.lineId = 'OTHER';
    stops[1].parent_station = '';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).not.toThrow();
    stops[1].parent_station = 'parent-S';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('does not uniquely identify S');
    duplicateCode.endedAt = '2026-02-30';
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow();
  });

  it('requires unique source platforms and well-formed station parents', () => {
    const changes = [
      (rows: CsvRow[]) => rows.splice(1, 1),
      (rows: CsvRow[]) => rows.push({ ...rows[1] }),
      (rows: CsvRow[]) => {
        rows[1].location_type = '1';
      },
      (rows: CsvRow[]) => {
        rows[1].stop_code = '';
      },
      (rows: CsvRow[]) => {
        rows[1].parent_station = 'missing';
      },
      (rows: CsvRow[]) => rows.push({ ...rows[0] }),
      (rows: CsvRow[]) => {
        rows[0].location_type = '0';
      },
      (rows: CsvRow[]) => {
        rows[0].parent_station = 'parent-D';
      },
    ];
    for (const change of changes) {
      const { input, canonical, stops } = sourceFixture();
      change(stops);
      expect(() =>
        validateScheduledTripPatternSourceStops(input, stops, canonical),
      ).toThrow();
    }
  });

  it('rejects missing, duplicated or partial platform alternatives and ambiguous canonical labels', () => {
    for (const label of ['', 'A', 'A/', 'A//B', 'A/A', 'A/B/Q', 'UNKNOWN']) {
      const { input, canonical, stops } = sourceFixture();
      stops[1].platform_code = label;
      expect(() =>
        validateScheduledTripPatternSourceStops(input, stops, canonical),
      ).toThrow();
    }
    const { input, canonical, stops } = sourceFixture();
    input.binding.pattern.stops[0].platformIds = ['A'];
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('complete canonical platform set');
    input.binding.pattern.stops[0].platformIds = ['A', 'B'];
    canonical.stations[0].platforms.push({
      ...canonical.stations[0].platforms[0],
      id: 'DUPLICATE-LABEL',
    });
    expect(() =>
      validateScheduledTripPatternSourceStops(input, stops, canonical),
    ).toThrow('expected one platform for label A');
  });
});

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

  it('preserves the closing occurrence display code when a loop rotation crosses the boundary', () => {
    const canonical = datedTopology();
    canonical.services[0].revisions[0].stations[2].displayCode = 'S2';
    canonical.stations[0].stationCodes[0].endedAt = '2026-01-02';
    canonical.stations[0].stationCodes.push({
      lineId: 'L',
      code: 'S2',
      startedAt: '2026-01-02',
      endedAt: null,
    });

    expect(() =>
      validateScheduledTripPatternDateScope(
        scope(['D', 'S', 'D'], ['2026-01-01']),
        canonical,
      ),
    ).toThrow('has active station codes');
    expect(
      validateScheduledTripPatternDateScope(
        scope(['D', 'S', 'D'], ['2026-01-02']),
        canonical,
      ).serviceDates,
    ).toEqual(['2026-01-02']);
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
