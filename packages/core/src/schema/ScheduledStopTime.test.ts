import { describe, expect, it } from 'vitest';
import { ScheduledStopTimeSchema } from './ScheduledStopTime.js';

const occurrence = {
  providerTripId: 'T',
  providerStopId: 'P',
  stopSequence: '09007199254740993',
  arrivalSeconds: 87000,
  departureSeconds: 87060,
  pickupType: 1,
  dropOffType: 0,
  timepoint: 1,
};

describe('ScheduledStopTimeSchema', () => {
  it('round-trips large textual occurrence identity and service-day seconds', () => {
    expect(
      ScheduledStopTimeSchema.parse(JSON.parse(JSON.stringify(occurrence))),
    ).toEqual(occurrence);
  });
  it('retains unavailable approximate times as null rather than scheduled midnight', () => {
    expect(
      ScheduledStopTimeSchema.parse({
        ...occurrence,
        timepoint: 0,
        arrivalSeconds: null,
        departureSeconds: null,
      }),
    ).toMatchObject({
      timepoint: 0,
      arrivalSeconds: null,
      departureSeconds: null,
    });
    expect(
      ScheduledStopTimeSchema.parse({
        ...occurrence,
        arrivalSeconds: 0,
        departureSeconds: 0,
      }),
    ).toMatchObject({ arrivalSeconds: 0, departureSeconds: 0 });
  });
  it.each([
    'arrivalSeconds',
    'departureSeconds',
  ])('requires %s for an exact timepoint', (field) => {
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, [field]: null }),
    ).toThrow('exact timepoint');
  });
  it('rejects a departure rolled back to the next civil midnight', () => {
    expect(() =>
      ScheduledStopTimeSchema.parse({
        ...occurrence,
        arrivalSeconds: 86340,
        departureSeconds: 0,
      }),
    ).toThrow('Departure cannot precede arrival');
  });
  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])('rejects unrepresentable service-day seconds: %s', (arrivalSeconds) => {
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, arrivalSeconds }),
    ).toThrow();
  });
  it.each([
    '',
    '-1',
    '1.5',
    '1e3',
  ])('rejects a non-decimal stop sequence: %s', (stopSequence) => {
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, stopSequence }),
    ).toThrow();
  });
  it('requires explicit access/precision values and rejects stray allocation metadata', () => {
    const { pickupType: _pickup, ...withoutPickup } = occurrence;
    expect(() => ScheduledStopTimeSchema.parse(withoutPickup)).toThrow();
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, pickupType: 4 }),
    ).toThrow();
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, dropOffType: -1 }),
    ).toThrow();
    expect(() =>
      ScheduledStopTimeSchema.parse({ ...occurrence, timepoint: 2 }),
    ).toThrow();
    expect(() =>
      ScheduledStopTimeSchema.parse({
        ...occurrence,
        generationEligible: true,
      }),
    ).toThrow();
  });
});
