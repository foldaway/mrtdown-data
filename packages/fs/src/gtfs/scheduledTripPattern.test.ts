import { describe, expect, it } from 'vitest';
import { validateScheduledTripPatternReferences } from './scheduledTripPattern.js';
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
