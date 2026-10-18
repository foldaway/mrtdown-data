import { describe, expect, it } from 'vitest';
import { ScheduledTripPatternSchema } from './ScheduledTripPattern.js';

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

describe('ScheduledTripPatternSchema', () => {
  it('preserves ordered repeated visits and normalizes only unordered platform alternatives', () => {
    const value = pattern();
    const before = JSON.stringify(value);
    const parsed = ScheduledTripPatternSchema.parse(value);
    expect(parsed.stops).toEqual([
      { stationId: 'S', platformIds: ['A', 'B'] },
      { stationId: 'D', platformIds: ['Q'] },
      { stationId: 'S', platformIds: ['A', 'B'] },
    ]);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(JSON.stringify(value)).toBe(before);
  });

  it('rejects missing or duplicated alternatives, a mismatched destination and allocation metadata', () => {
    const value = pattern();
    for (const change of [
      { stops: [] },
      { stops: [{ stationId: 'S', platformIds: ['A'] }] },
      { stops: [{ stationId: 'S', platformIds: [] }, ...value.stops] },
      { stops: [{ stationId: 'S', platformIds: ['A', 'A'] }, ...value.stops] },
      { destinationStationId: 'D' },
      { generationEligible: true },
    ]) {
      expect(
        ScheduledTripPatternSchema.safeParse({ ...value, ...change }).success,
      ).toBe(false);
    }
  });
});
