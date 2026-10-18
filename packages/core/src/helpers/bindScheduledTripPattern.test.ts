import { describe, expect, it } from 'vitest';
import type { ScheduledTripPatternBinding } from '../schema/ScheduledTripPatternBinding.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import { bindScheduledTripPattern } from './bindScheduledTripPattern.js';

function trip(): ScheduledTripTimes {
  return {
    providerTripId: 'T',
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes: [
      {
        providerTripId: 'T',
        providerStopId: 'P',
        stopSequence: '09007199254740992',
        arrivalSeconds: 86340,
        departureSeconds: 86400,
        pickupType: 1,
        dropOffType: 0,
        timepoint: 1,
      },
      {
        providerTripId: 'T',
        providerStopId: 'Q',
        stopSequence: '9007199254740993',
        arrivalSeconds: null,
        departureSeconds: null,
        pickupType: 0,
        dropOffType: 0,
        timepoint: 0,
      },
      {
        providerTripId: 'T',
        providerStopId: 'P',
        stopSequence: '9007199254740994',
        arrivalSeconds: 90000,
        departureSeconds: 90000,
        pickupType: 0,
        dropOffType: 3,
        timepoint: 1,
      },
    ],
  };
}

function binding(): ScheduledTripPatternBinding {
  return {
    providerTripId: 'T',
    pattern: {
      lineId: 'L',
      serviceId: 'LOOP',
      revisionId: 'r1',
      destinationStationId: 'S',
      stops: [
        { stationId: 'S', platformIds: ['B', 'A'] },
        { stationId: 'D', platformIds: ['Q'] },
        { stationId: 'S', platformIds: ['A', 'B'] },
      ],
    },
    occurrences: trip().stopTimes.map(({ providerStopId, stopSequence }) => ({
      providerStopId,
      stopSequence,
    })),
  };
}

describe('bindScheduledTripPattern', () => {
  it('joins repeated source occurrences to canonical identities while retaining all timing and access rules', () => {
    const source = trip();
    const input = binding();
    const before = JSON.stringify([source, input]);
    const result = bindScheduledTripPattern(source, input);
    expect(result).toMatchObject({
      providerTripId: 'T',
      providerRouteId: 'R',
      providerCalendarId: 'C',
      lineId: 'L',
      serviceId: 'LOOP',
      revisionId: 'r1',
      destinationStationId: 'S',
    });
    expect(
      result.stopTimes.map(({ stationId, platformIds }) => ({
        stationId,
        platformIds,
      })),
    ).toEqual([
      { stationId: 'S', platformIds: ['A', 'B'] },
      { stationId: 'D', platformIds: ['Q'] },
      { stationId: 'S', platformIds: ['A', 'B'] },
    ]);
    expect(
      result.stopTimes.map(
        ({ stationId: _station, platformIds: _platforms, ...timing }) => timing,
      ),
    ).toEqual(source.stopTimes);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify([source, input])).toBe(before);
  });

  it('rejects wrong-trip bindings and missing or extra occurrences instead of truncating the join', () => {
    expect(() =>
      bindScheduledTripPattern(trip(), {
        ...binding(),
        providerTripId: 'OTHER',
      }),
    ).toThrow('does not match binding');
    const input = binding();
    input.pattern.stops.pop();
    input.pattern.destinationStationId = 'D';
    expect(() => bindScheduledTripPattern(trip(), input)).toThrow(
      'equal length',
    );
    input.occurrences.pop();
    expect(() => bindScheduledTripPattern(trip(), input)).toThrow(
      '3 occurrences; binding has 2',
    );
    const extra = binding();
    extra.pattern.stops.push({ stationId: 'S', platformIds: ['A', 'B'] });
    extra.occurrences.push({
      providerStopId: 'P',
      stopSequence: '9007199254740995',
    });
    expect(() => bindScheduledTripPattern(trip(), extra)).toThrow(
      '3 occurrences; binding has 4',
    );
  });

  it('requires literal stop and sequence identity in order, including unsafe integers and leading zeroes', () => {
    for (const change of [
      { providerStopId: 'OTHER' },
      { stopSequence: '09007199254740993' },
      { stopSequence: '9007199254740992' },
    ]) {
      const input = binding();
      Object.assign(input.occurrences[0], change);
      expect(() => bindScheduledTripPattern(trip(), input)).toThrow(
        'source occurrence 0 differs',
      );
    }
    const reordered = binding();
    reordered.occurrences.reverse();
    expect(() => bindScheduledTripPattern(trip(), reordered)).toThrow(
      'source occurrence 0 differs',
    );
  });
});
