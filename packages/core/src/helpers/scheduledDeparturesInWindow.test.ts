import { describe, expect, it } from 'vitest';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import {
  type ScheduledTripDateSelection,
  scheduledDeparturesInWindow,
} from './scheduledDeparturesInWindow.js';

function selection(
  serviceDate: string,
  seconds: number[],
  providerTripId = 'T',
): ScheduledTripDateSelection {
  const trip: ScheduledTripTimes = {
    providerTripId,
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes: seconds.map((time, index) => ({
      providerTripId,
      providerStopId: 'REPEATED',
      stopSequence: index === 0 ? '09007199254740992' : '9007199254740993',
      arrivalSeconds: time,
      departureSeconds: time,
      pickupType: 0,
      dropOffType: 0,
      timepoint: 1,
    })),
  };
  return {
    trip,
    serviceDate,
    calendar: {
      providerCalendarId: 'C',
      weekly: null,
      exceptions: [{ date: serviceDate, available: true }],
    },
  };
}

const window = {
  startInstant: '2026-01-02T00:30:00+08:00',
  endInstant: '2026-01-01T18:00:00Z',
};

describe('scheduledDeparturesInWindow', () => {
  it('merges previous-day and current-day departures chronologically using instant boundaries', () => {
    const previous = selection('2026-01-01', [90000, 93600], 'previous');
    const current = selection('2026-01-02', [1800, 5400], 'current');
    expect(
      scheduledDeparturesInWindow([previous, current], window).map((stop) => [
        stop.providerTripId,
        stop.serviceDate,
        stop.departureInstant,
      ]),
    ).toEqual([
      ['current', '2026-01-02', '2026-01-01T16:30:00Z'],
      ['previous', '2026-01-01', '2026-01-01T17:00:00Z'],
      ['current', '2026-01-02', '2026-01-01T17:30:00Z'],
    ]);
  });

  it('retains distinct coincident visits in deterministic date, trip and exact sequence order', () => {
    const selections = [
      selection('2026-01-02', [3600, 3600], 'z'),
      selection('2026-01-01', [90000, 90000], 'z'),
      selection('2026-01-02', [3600, 3600], 'Z'),
    ];
    const result = scheduledDeparturesInWindow(selections, window);
    expect(
      result.map((stop) => [
        stop.serviceDate,
        stop.providerTripId,
        stop.stopSequence,
      ]),
    ).toEqual([
      ['2026-01-01', 'z', '09007199254740992'],
      ['2026-01-01', 'z', '9007199254740993'],
      ['2026-01-02', 'Z', '09007199254740992'],
      ['2026-01-02', 'Z', '9007199254740993'],
      ['2026-01-02', 'z', '09007199254740992'],
      ['2026-01-02', 'z', '9007199254740993'],
    ]);
    expect(
      scheduledDeparturesInWindow([...selections].reverse(), window),
    ).toEqual(result);
  });

  it('skips absent departure times while retaining explicit midnight, access rules and source data', () => {
    const input = selection('2026-01-02', [0, 0]);
    input.trip.stopTimes[0].pickupType = 1;
    input.trip.stopTimes[0].dropOffType = 3;
    input.trip.stopTimes[0].timepoint = 0;
    input.trip.stopTimes[1].timepoint = 0;
    input.trip.stopTimes[1].departureSeconds = null;
    const before = JSON.stringify(input);
    const result = scheduledDeparturesInWindow([input], {
      startInstant: '2026-01-01T16:00:00Z',
      endInstant: '2026-01-01T16:00:01Z',
    });
    expect(result).toEqual([
      {
        ...input.trip.stopTimes[0],
        providerRouteId: 'R',
        providerCalendarId: 'C',
        serviceDate: '2026-01-02',
        arrivalInstant: '2026-01-01T16:00:00Z',
        departureInstant: '2026-01-01T16:00:00Z',
      },
    ]);
    result[0].pickupType = 0;
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps events from explicitly selected dates more than a day earlier without enabling inactive dates', () => {
    const earlier = selection('2026-01-01', [172800, 172860]);
    const inactive = selection('2026-01-03', [0, 60]);
    inactive.calendar.exceptions[0].available = false;
    const result = scheduledDeparturesInWindow([inactive, earlier], {
      startInstant: '2026-01-02T16:00:00Z',
      endInstant: '2026-01-02T16:01:00Z',
    });
    expect(
      result.map((stop) => [stop.serviceDate, stop.departureSeconds]),
    ).toEqual([['2026-01-01', 172800]]);
  });

  it('rejects duplicate selections and invalid source inputs even when events fall outside the window', () => {
    const input = selection('2026-01-02', [0, 60]);
    expect(() => scheduledDeparturesInWindow([input, input], window)).toThrow(
      'Duplicate trip/service-date',
    );
    input.calendar.providerCalendarId = 'OTHER';
    expect(() => scheduledDeparturesInWindow([input], window)).toThrow(
      'requires calendar C',
    );
  });

  it('requires an ordered window of absolute instants and supports an empty selection', () => {
    expect(scheduledDeparturesInWindow([], window)).toEqual([]);
    expect(() =>
      scheduledDeparturesInWindow([], {
        ...window,
        endInstant: window.startInstant,
      }),
    ).toThrow('must end after');
    expect(() =>
      scheduledDeparturesInWindow([], {
        ...window,
        endInstant: '2026-01-01T15:00:00Z',
      }),
    ).toThrow('must end after');
    expect(() =>
      scheduledDeparturesInWindow([], {
        ...window,
        startInstant: '2026-01-02T00:30:00',
      }),
    ).toThrow();
  });
});
