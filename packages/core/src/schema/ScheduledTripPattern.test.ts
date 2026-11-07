import { describe, expect, it } from 'vitest';
import {
  ScheduledTripPatternSchema,
  scheduledServiceMemberships,
} from './ScheduledTripPattern.js';

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
  it('represents both memberships on one journey, with no preferred service or duplicated occurrences', () => {
    const { serviceId: _service, revisionId: _revision, ...common } = pattern();
    const input = {
      ...common,
      serviceMemberships: [
        { serviceId: 'LOOP', revisionId: 'r1' },
        { serviceId: 'BRANCH', revisionId: 'r2' },
      ],
    };
    const before = structuredClone(input);
    const parsed = ScheduledTripPatternSchema.parse(input);
    expect(scheduledServiceMemberships(parsed)).toEqual([
      { serviceId: 'BRANCH', revisionId: 'r2' },
      { serviceId: 'LOOP', revisionId: 'r1' },
    ]);
    expect(parsed.stops.map((stop) => stop.stationId)).toEqual(['S', 'D', 'S']);
    expect(parsed).not.toHaveProperty('serviceId');
    expect(input).toEqual(before);
    for (const serviceMemberships of [
      [],
      [input.serviceMemberships[0]],
      [input.serviceMemberships[0], input.serviceMemberships[0]],
    ]) {
      expect(
        ScheduledTripPatternSchema.safeParse({ ...common, serviceMemberships })
          .success,
      ).toBe(false);
    }
    expect(
      ScheduledTripPatternSchema.safeParse({
        ...input,
        serviceId: 'LOOP',
        revisionId: 'r1',
      }).success,
    ).toBe(false);
    const legacy = pattern();
    expect(Object.keys(ScheduledTripPatternSchema.parse(legacy))).toEqual(
      Object.keys(legacy),
    );
  });
});
