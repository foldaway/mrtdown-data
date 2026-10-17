import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';
import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import type { ScheduledTripTimes } from '../schema/ScheduledTripTimes.js';
import { scheduledTripTimesOnDate } from './scheduledTripTimesOnDate.js';

function calendar(): ScheduledServiceCalendar {
  return {
    providerCalendarId: 'C',
    weekly: null,
    exceptions: [
      { date: '2026-01-01', available: true },
      { date: '2026-01-02', available: false },
    ],
  };
}

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
        dropOffType: 2,
        timepoint: 1,
      },
      {
        providerTripId: 'T',
        providerStopId: 'Q',
        stopSequence: '9007199254740993',
        arrivalSeconds: null,
        departureSeconds: null,
        pickupType: 3,
        dropOffType: 1,
        timepoint: 0,
      },
      {
        providerTripId: 'T',
        providerStopId: 'P',
        stopSequence: '9007199254740994',
        arrivalSeconds: 90000,
        departureSeconds: 90060,
        pickupType: 2,
        dropOffType: 3,
        timepoint: 0,
      },
    ],
  };
}

describe('scheduledTripTimesOnDate', () => {
  it('resolves enabled source events while retaining all offsets, occurrence identities and access/precision rules', () => {
    const input = trip();
    const result = scheduledTripTimesOnDate(input, calendar(), '2026-01-01');
    expect(result).toEqual({
      ...input,
      serviceDate: '2026-01-01',
      stopTimes: [
        {
          ...input.stopTimes[0],
          arrivalInstant: '2026-01-01T15:59:00Z',
          departureInstant: '2026-01-01T16:00:00Z',
        },
        { ...input.stopTimes[1], arrivalInstant: null, departureInstant: null },
        {
          ...input.stopTimes[2],
          arrivalInstant: '2026-01-01T17:00:00Z',
          departureInstant: '2026-01-01T17:01:00Z',
        },
      ],
    });
  });

  it('retains a previous service day after midnight even when the next date is removed', () => {
    const previous = scheduledTripTimesOnDate(trip(), calendar(), '2026-01-01');
    expect(previous?.serviceDate).toBe('2026-01-01');
    expect(previous?.stopTimes[2]?.departureInstant).toBe(
      '2026-01-01T17:01:00Z',
    );
    expect(
      scheduledTripTimesOnDate(trip(), calendar(), '2026-01-02'),
    ).toBeNull();
    expect(
      scheduledTripTimesOnDate(trip(), calendar(), '2026-01-03'),
    ).toBeNull();
  });

  it('keeps coincident events on separate service dates as distinct trip occurrences', () => {
    const rules = calendar();
    rules.exceptions[1] = { date: '2026-01-02', available: true };
    const current = trip();
    current.stopTimes = current.stopTimes.map((stop) => ({
      ...stop,
      arrivalSeconds:
        stop.arrivalSeconds === null ? null : stop.arrivalSeconds - 86400 + 60,
      departureSeconds:
        stop.departureSeconds === null
          ? null
          : stop.departureSeconds - 86400 + 60,
    }));
    const previous = trip();
    previous.stopTimes = previous.stopTimes.map((stop) => ({
      ...stop,
      arrivalSeconds:
        stop.arrivalSeconds === null ? null : stop.arrivalSeconds + 60,
      departureSeconds:
        stop.departureSeconds === null ? null : stop.departureSeconds + 60,
    }));
    const first = scheduledTripTimesOnDate(previous, rules, '2026-01-01');
    const second = scheduledTripTimesOnDate(current, rules, '2026-01-02');
    expect(first?.stopTimes[0]?.arrivalInstant).toBe(
      second?.stopTimes[0]?.arrivalInstant,
    );
    expect(first?.serviceDate).not.toBe(second?.serviceDate);
    expect(first?.providerTripId).toBe(second?.providerTripId);
  });

  it('preserves an absent arrival or departure independently from an explicit midnight', () => {
    const input = trip();
    input.stopTimes = input.stopTimes.map((stop, index) => ({
      ...stop,
      timepoint: 0,
      arrivalSeconds: index === 1 ? null : 0,
      departureSeconds: index === 1 ? 0 : null,
    }));
    const result = scheduledTripTimesOnDate(input, calendar(), '2026-01-01');
    expect(
      result?.stopTimes.map((stop) => [
        stop.arrivalInstant,
        stop.departureInstant,
      ]),
    ).toEqual([
      ['2025-12-31T16:00:00Z', null],
      [null, '2025-12-31T16:00:00Z'],
      ['2025-12-31T16:00:00Z', null],
    ]);
  });

  it('uses inclusive weekly dates and explicit exceptions without inferring holidays', () => {
    const rules: ScheduledServiceCalendar = {
      ...calendar(),
      weekly: {
        startDate: '2026-01-01',
        endDate: '2026-01-07',
        weekdays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false,
        },
      },
      exceptions: [
        { date: '2026-01-02', available: false },
        { date: '2026-01-10', available: true },
      ],
    };
    for (const date of ['2026-01-01', '2026-01-07', '2026-01-10'])
      expect(scheduledTripTimesOnDate(trip(), rules, date)?.serviceDate).toBe(
        date,
      );
    for (const date of ['2025-12-31', '2026-01-02', '2026-01-03', '2026-01-08'])
      expect(scheduledTripTimesOnDate(trip(), rules, date)).toBeNull();
  });

  it.each([
    ['2026-12-31', 90000, '2026-12-31T17:00:00Z'],
    ['2024-02-29', 172800, '2024-03-01T16:00:00Z'],
    ['1942-02-16', 0, '1942-02-15T15:00:00Z'],
  ])('uses the original service-date anchor for %s plus %s seconds', (date, seconds, expected) => {
    const input = trip();
    input.stopTimes = input.stopTimes.map((stop) => ({
      ...stop,
      arrivalSeconds: seconds,
      departureSeconds: seconds,
    }));
    const rules = { ...calendar(), exceptions: [{ date, available: true }] };
    const result = scheduledTripTimesOnDate(input, rules, date);
    expect(result?.serviceDate).toBe(date);
    expect(result?.stopTimes[0]?.arrivalInstant).toBe(expected);
  });

  it('allows callers to order independently resolved service days by their instants', () => {
    const rules = calendar();
    rules.exceptions[1] = { date: '2026-01-02', available: true };
    const early = trip();
    early.stopTimes = early.stopTimes.map((stop) => ({
      ...stop,
      arrivalSeconds: 1800,
      departureSeconds: 1800,
    }));
    const events = [
      scheduledTripTimesOnDate(trip(), rules, '2026-01-01'),
      scheduledTripTimesOnDate(early, rules, '2026-01-02'),
    ]
      .flatMap((resolved) =>
        resolved
          ? [
              {
                serviceDate: resolved.serviceDate,
                instant: resolved.stopTimes[2]?.departureInstant ?? '',
              },
            ]
          : [],
      )
      .sort((a, b) => Temporal.Instant.compare(a.instant, b.instant));
    expect(events).toEqual([
      { serviceDate: '2026-01-02', instant: '2026-01-01T16:30:00Z' },
      { serviceDate: '2026-01-01', instant: '2026-01-01T17:01:00Z' },
    ]);
  });

  it.each([
    '2026-01-01',
    '2026-01-02',
  ])('rejects a mismatched calendar before resolving date %s', (date) => {
    expect(() =>
      scheduledTripTimesOnDate(
        trip(),
        { ...calendar(), providerCalendarId: 'OTHER' },
        date,
      ),
    ).toThrow('requires calendar C');
  });

  it.each([
    '',
    '2026-02-29',
    '20260101',
    '2026-1-1',
    '2026-01-01T00:00:00Z',
  ])('rejects invalid service date %s', (date) => {
    expect(() => scheduledTripTimesOnDate(trip(), calendar(), date)).toThrow();
  });

  it('validates trip and calendar inputs even when the requested date is inactive', () => {
    const input = trip();
    input.stopTimes[2].stopSequence = input.stopTimes[0].stopSequence;
    expect(() =>
      scheduledTripTimesOnDate(input, calendar(), '2026-01-02'),
    ).toThrow('strictly increase');
    const rules = calendar();
    rules.exceptions.push({ date: '2026-01-02', available: false });
    expect(() => scheduledTripTimesOnDate(trip(), rules, '2026-01-02')).toThrow(
      'Duplicate calendar exception date',
    );
  });

  it('throws rather than returning partial timing when an enabled offset exceeds the instant range', () => {
    const input = trip();
    input.stopTimes[2].departureSeconds = Number.MAX_SAFE_INTEGER;
    expect(() =>
      scheduledTripTimesOnDate(input, calendar(), '2026-01-01'),
    ).toThrow(RangeError);
  });

  it('returns independent records without mutating source timing or calendar rules', () => {
    const input = trip();
    const rules = calendar();
    const before = JSON.stringify([input, rules]);
    const resolved = scheduledTripTimesOnDate(input, rules, '2026-01-01');
    if (!resolved) throw new Error('Expected enabled fixture');
    resolved.stopTimes[0].pickupType = 0;
    resolved.stopTimes[0].stopSequence = 'CHANGED';
    expect(JSON.stringify([input, rules])).toBe(before);
    expect(
      scheduledTripTimesOnDate(input, rules, '2026-01-01')?.stopTimes[0]
        ?.pickupType,
    ).toBe(1);
  });
});
