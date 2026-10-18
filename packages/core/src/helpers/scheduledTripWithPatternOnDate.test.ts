import { describe, expect, it } from 'vitest';
import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import type { ScheduledTripPatternDateScope } from '../schema/ScheduledTripPatternDateScope.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import { scheduledTripWithPatternOnDate } from './scheduledTripWithPatternOnDate.js';

function trip(): ScheduledTripTimes {
  return {
    providerTripId: 'T',
    providerRouteId: 'R',
    providerCalendarId: 'C',
    stopTimes: ['P', 'Q'].map((providerStopId, index) => ({
      providerTripId: 'T',
      providerStopId,
      stopSequence: String(index + 1),
      arrivalSeconds: 90000 + index * 1800,
      departureSeconds: 90000 + index * 1800,
      pickupType: 1,
      dropOffType: 3,
      timepoint: 1,
    })),
  };
}

function calendar(): ScheduledServiceCalendar {
  return {
    providerCalendarId: 'C',
    weekly: null,
    exceptions: [
      { date: '2026-01-01', available: true },
      { date: '2026-01-02', available: false },
      { date: '2026-01-03', available: true },
      { date: '2026-01-04', available: true },
    ],
  };
}

function scope(
  serviceDates: string[],
  revisionId = 'r1',
  platformIds = ['B', 'A'],
): ScheduledTripPatternDateScope {
  return {
    serviceDates,
    binding: {
      providerTripId: 'T',
      pattern: {
        lineId: 'L',
        serviceId: 'SERVICE',
        revisionId,
        destinationStationId: 'D',
        stops: [
          { stationId: 'S', platformIds },
          { stationId: 'D', platformIds: ['Q'] },
        ],
      },
      occurrences: [
        { providerStopId: 'P', stopSequence: '1' },
        { providerStopId: 'Q', stopSequence: '2' },
      ],
    },
  };
}

describe('scheduledTripWithPatternOnDate', () => {
  it('selects the exact date scope and retains a previous service day after midnight despite next-day removal', () => {
    const source = trip();
    const rules = calendar();
    const scopes = [scope(['2026-01-03'], 'r2', ['C']), scope(['2026-01-01'])];
    const before = JSON.stringify([source, rules, scopes]);
    const first = scheduledTripWithPatternOnDate(
      source,
      rules,
      scopes,
      '2026-01-01',
    );
    expect(first).toMatchObject({
      ...source,
      serviceDate: '2026-01-01',
      revisionId: 'r1',
      destinationStationId: 'D',
    });
    expect(
      first?.stopTimes.map((stop) => [
        stop.stationId,
        stop.platformIds,
        stop.departureInstant,
      ]),
    ).toEqual([
      ['S', ['A', 'B'], '2026-01-01T17:00:00Z'],
      ['D', ['Q'], '2026-01-01T17:30:00Z'],
    ]);
    const later = scheduledTripWithPatternOnDate(
      source,
      rules,
      [...scopes].reverse(),
      '2026-01-03',
    );
    expect(later?.revisionId).toBe('r2');
    expect(later?.stopTimes[0]).toMatchObject({
      platformIds: ['C'],
      departureInstant: '2026-01-03T17:00:00Z',
    });
    expect(
      scheduledTripWithPatternOnDate(source, rules, scopes, '2026-01-02'),
    ).toBeNull();
    expect(JSON.stringify([source, rules, scopes])).toBe(before);
  });

  it('throws for active mapping gaps and overlapping scopes instead of omitting a trip or choosing a winner', () => {
    expect(() =>
      scheduledTripWithPatternOnDate(trip(), calendar(), [], '2026-01-01'),
    ).toThrow('has no binding');
    expect(() =>
      scheduledTripWithPatternOnDate(
        trip(),
        calendar(),
        [scope(['2026-01-01'])],
        '2026-01-04',
      ),
    ).toThrow('has no binding');
    const overlapping = [
      scope(['2026-01-01', '2026-01-03']),
      scope(['2026-01-03'], 'r2'),
    ];
    for (const date of ['2026-01-01', '2026-01-02']) {
      expect(() =>
        scheduledTripWithPatternOnDate(trip(), calendar(), overlapping, date),
      ).toThrow('Overlapping binding service date: 2026-01-03');
    }
  });

  it('validates every scope and its source binding even when the requested source date is inactive', () => {
    expect(() =>
      scheduledTripWithPatternOnDate(
        trip(),
        calendar(),
        [scope(['2026-01-02'])],
        '2026-01-02',
      ),
    ).toThrow('is inactive');
    expect(() =>
      scheduledTripWithPatternOnDate(
        trip(),
        calendar(),
        [scope(['2026-01-03', '2026-01-03'])],
        '2026-01-02',
      ),
    ).toThrow('must be unique');
    const wrongTrip = scope(['2026-01-03']);
    wrongTrip.binding.providerTripId = 'OTHER';
    expect(() =>
      scheduledTripWithPatternOnDate(
        trip(),
        calendar(),
        [scope(['2026-01-01']), wrongTrip],
        '2026-01-02',
      ),
    ).toThrow('does not match binding');
  });
});
