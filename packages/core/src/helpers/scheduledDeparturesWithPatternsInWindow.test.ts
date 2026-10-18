import { describe, expect, it } from 'vitest';
import {
  type ScheduledTripPatternDateSelection,
  scheduledDeparturesWithPatternsInWindow,
} from './scheduledDeparturesWithPatternsInWindow.js';

function selection(
  serviceDate: string,
  seconds: number[],
  providerTripId: string,
  revisionId = 'r1',
  platformIds = ['B', 'A'],
): ScheduledTripPatternDateSelection {
  const trip = {
    providerTripId,
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes: seconds.map((time, index) => ({
      providerTripId,
      providerStopId: 'REPEATED',
      stopSequence: index === 0 ? '09007199254740992' : '9007199254740993',
      arrivalSeconds: time,
      departureSeconds: time,
      pickupType: 0 as const,
      dropOffType: 0 as const,
      timepoint: 1 as const,
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
    scopes: [
      {
        serviceDates: [serviceDate],
        binding: {
          providerTripId,
          pattern: {
            lineId: 'L',
            serviceId: 'LOOP',
            revisionId,
            destinationStationId: 'S',
            stops: seconds.map(() => ({ stationId: 'S', platformIds })),
          },
          occurrences: trip.stopTimes.map(
            ({ providerStopId, stopSequence }) => ({
              providerStopId,
              stopSequence,
            }),
          ),
        },
      },
    ],
  };
}

const window = {
  startInstant: '2026-01-02T00:30:00+08:00',
  endInstant: '2026-01-01T17:30:00Z',
};

describe('scheduledDeparturesWithPatternsInWindow', () => {
  it('distinguishes an earlier boarding visit from the same station at the trip end without changing source rules', () => {
    const input = selection('2026-01-01', [90000, 90000], 'loop');
    input.trip.stopTimes[0].pickupType = 3;
    const before = JSON.stringify(input);
    const result = scheduledDeparturesWithPatternsInWindow([input], window, {
      boardingOnly: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerTripId: 'loop',
      stopSequence: '09007199254740992',
      pickupType: 3,
      stationId: 'S',
      destinationStationId: 'S',
      platformIds: ['A', 'B'],
    });
    expect(
      scheduledDeparturesWithPatternsInWindow([input], window),
    ).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('merges service dates with their own canonical identities, preserving coincident visits and half-open boundaries', () => {
    const selections = [
      selection('2026-01-01', [90000, 90000], 'late', 'previous'),
      selection('2026-01-02', [1800, 3600], 'current', 'current', ['C']),
      selection('2026-01-02', [5400, 5400], 'end'),
    ];
    const before = JSON.stringify(selections);
    const result = scheduledDeparturesWithPatternsInWindow(selections, window);
    expect(
      result.map((stop) => [
        stop.providerTripId,
        stop.serviceDate,
        stop.stopSequence,
        stop.revisionId,
        stop.platformIds,
        stop.departureInstant,
      ]),
    ).toEqual([
      [
        'current',
        '2026-01-02',
        '09007199254740992',
        'current',
        ['C'],
        '2026-01-01T16:30:00Z',
      ],
      [
        'late',
        '2026-01-01',
        '09007199254740992',
        'previous',
        ['A', 'B'],
        '2026-01-01T17:00:00Z',
      ],
      [
        'late',
        '2026-01-01',
        '9007199254740993',
        'previous',
        ['A', 'B'],
        '2026-01-01T17:00:00Z',
      ],
      [
        'current',
        '2026-01-02',
        '9007199254740993',
        'current',
        ['C'],
        '2026-01-01T17:00:00Z',
      ],
    ]);
    for (const departure of result) {
      expect(departure).toMatchObject({
        lineId: 'L',
        serviceId: 'LOOP',
        destinationStationId: 'S',
        stationId: 'S',
        providerRouteId: 'R',
        providerCalendarId: 'C',
      });
    }
    expect(
      scheduledDeparturesWithPatternsInWindow(
        [...selections].reverse(),
        window,
      ),
    ).toEqual(result);
    expect(JSON.stringify(selections)).toBe(before);
  });

  it('filters missing departures without shifting canonical occurrence identity or removing access restrictions', () => {
    const input = selection('2026-01-02', [1800, 3600], 'T');
    input.trip.stopTimes[0].departureSeconds = null;
    input.trip.stopTimes[0].timepoint = 0;
    input.trip.stopTimes[1].pickupType = 1;
    input.trip.stopTimes[1].dropOffType = 3;
    input.scopes[0].binding.pattern.stops[1].platformIds = ['C'];
    const result = scheduledDeparturesWithPatternsInWindow([input], window);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      stopSequence: '9007199254740993',
      platformIds: ['C'],
      pickupType: 1,
      dropOffType: 3,
      departureInstant: '2026-01-01T17:00:00Z',
    });
  });

  it('validates scopes and duplicate selections before out-of-window or inactive trips can disappear', () => {
    const outside = selection('2026-01-02', [0, 60], 'T');
    const scopes = outside.scopes;
    outside.scopes = [];
    expect(() =>
      scheduledDeparturesWithPatternsInWindow([outside], window, {
        boardingOnly: true,
      }),
    ).toThrow('has no binding');
    outside.scopes = [...scopes, ...scopes];
    expect(() =>
      scheduledDeparturesWithPatternsInWindow([outside], window),
    ).toThrow('Overlapping binding service date');
    outside.scopes = [];
    outside.calendar.exceptions[0].available = false;
    expect(() =>
      scheduledDeparturesWithPatternsInWindow([outside, outside], window),
    ).toThrow('Duplicate trip/service-date');
    expect(scheduledDeparturesWithPatternsInWindow([], window)).toEqual([]);
    expect(() =>
      scheduledDeparturesWithPatternsInWindow([], {
        ...window,
        endInstant: window.startInstant,
      }),
    ).toThrow('must end after');
  });
});
