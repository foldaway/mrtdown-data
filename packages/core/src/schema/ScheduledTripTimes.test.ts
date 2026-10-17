import { describe, expect, it } from 'vitest';
import type { ScheduledStopTime } from './ScheduledStopTime.js';
import { ScheduledTripTimesSchema } from './ScheduledTripTimes.js';

function stop(
  stopSequence: string,
  arrivalSeconds: number | null,
  departureSeconds = arrivalSeconds,
): ScheduledStopTime {
  return {
    providerTripId: 'T',
    providerStopId: 'REPEATED',
    stopSequence,
    arrivalSeconds,
    departureSeconds,
    pickupType: 0,
    dropOffType: 0,
    timepoint: 0,
  };
}

function trip(stopTimes = [stop('1', 86300), stop('2', 90000)]) {
  return {
    providerTripId: 'T',
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes,
  };
}

describe('ScheduledTripTimesSchema', () => {
  it('retains large raw occurrence sequences and repeated stops beyond midnight', () => {
    const value = trip([
      { ...stop('09007199254740992', 86300, 86400), pickupType: 1 },
      { ...stop('9007199254740993', 90000), dropOffType: 3, timepoint: 1 },
    ]);
    expect(ScheduledTripTimesSchema.parse(value)).toEqual(value);
    expect(
      JSON.parse(JSON.stringify(ScheduledTripTimesSchema.parse(value))),
    ).toEqual(value);
  });
  it('allows equal known event times, nonconsecutive sequences and explicit midnight', () => {
    expect(
      ScheduledTripTimesSchema.parse(trip([stop('0', 0), stop('123', 0)]))
        .stopTimes[0]?.arrivalSeconds,
    ).toBe(0);
  });
  it('keeps unknown approximate times without interpolation or resetting chronology', () => {
    const value = trip([
      stop('0', 10, 20),
      stop('1', null),
      stop('2', 30, null),
      stop('3', null, 40),
      stop('4', 50, null),
    ]);
    expect(ScheduledTripTimesSchema.parse(value)).toEqual(value);
  });
  it.each([
    ['1', '1'],
    ['1', '01'],
    ['00', '0'],
    ['10', '9'],
    ['9007199254740993', '9007199254740992'],
  ])('rejects duplicate or reversed sequences %s, %s', (first, second) => {
    expect(() =>
      ScheduledTripTimesSchema.parse(trip([stop(first, 10), stop(second, 20)])),
    ).toThrow('strictly increase');
  });
  it.each([
    '',
    '-1',
    '1e3',
    '1.5',
    'x',
  ])('reports malformed sequence %s without throwing during safeParse', (sequence) => {
    expect(
      ScheduledTripTimesSchema.safeParse(
        trip([stop(sequence, 10), stop('2', 20)]),
      ).success,
    ).toBe(false);
  });
  it.each([
    [stop('1', 20), stop('2', 19)],
    [stop('1', 10, 20), stop('2', null), stop('3', 19)],
    [stop('1', 20, null), stop('2', null), stop('3', 19)],
    [stop('1', 10, 20), stop('2', null, 19), stop('3', 30)],
    [stop('1', 10), stop('2', 30, null), stop('3', 20)],
    [stop('1', 86399), stop('2', 0)],
  ])('rejects backward known events across approximate gaps: %j', (...stopTimes) => {
    expect(() => ScheduledTripTimesSchema.parse(trip(stopTimes))).toThrow(
      'earlier known event',
    );
  });
  it.each([
    0, 1,
  ])('requires arrival time at boundary index %s even when approximate', (index) => {
    const value = trip();
    value.stopTimes[index] = stop(String(index + 1), null, 90000);
    const result = ScheduledTripTimesSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['stopTimes', index, 'arrivalSeconds'],
          message: 'Trip boundaries require an arrival time',
        }),
      );
  });
  it('requires two occurrences and matching trip identities', () => {
    expect(ScheduledTripTimesSchema.safeParse(trip([])).success).toBe(false);
    expect(
      ScheduledTripTimesSchema.safeParse(trip([stop('1', 10)])).success,
    ).toBe(false);
    expect(() =>
      ScheduledTripTimesSchema.parse(
        trip([stop('1', 10), { ...stop('2', 20), providerTripId: 'OTHER' }]),
      ),
    ).toThrow('different trip');
  });
  it('still enforces exact times and same-stop chronology through the child schema', () => {
    expect(() =>
      ScheduledTripTimesSchema.parse(
        trip([{ ...stop('1', 10, null), timepoint: 1 }, stop('2', 20)]),
      ),
    ).toThrow('exact timepoint');
    expect(() =>
      ScheduledTripTimesSchema.parse(trip([stop('1', 20, 10), stop('2', 30)])),
    ).toThrow('Departure cannot precede arrival');
  });
  it.each([
    'providerTripId',
    'providerRouteId',
    'providerCalendarId',
  ])('requires %s', (field) => {
    expect(
      ScheduledTripTimesSchema.safeParse({ ...trip(), [field]: '' }).success,
    ).toBe(false);
  });
  it('rejects stray canonical allocation or approval metadata', () => {
    expect(
      ScheduledTripTimesSchema.safeParse({
        ...trip(),
        generationEligible: true,
      }).success,
    ).toBe(false);
  });
});
