import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';
import { ScheduledServiceCalendarSchema } from '../schema/ScheduledServiceCalendar.js';
import { ScheduledStopTimeSchema } from '../schema/ScheduledStopTime.js';
import { isScheduledServiceDate } from './isScheduledServiceDate.js';
import { scheduledServiceDayInstant } from './scheduledServiceDayInstant.js';

describe('scheduledServiceDayInstant', () => {
  it.each([
    ['2026-01-01', 0, '2025-12-31T16:00:00Z'],
    ['2026-01-01', 22890, '2025-12-31T22:21:30Z'],
    ['2026-01-01', 86400, '2026-01-01T16:00:00Z'],
    ['2026-01-01', 90123, '2026-01-01T17:02:03Z'],
    ['2026-01-01', 172800, '2026-01-02T16:00:00Z'],
    ['2026-01-31', 86400, '2026-01-31T16:00:00Z'],
    ['2026-12-31', 90000, '2026-12-31T17:00:00Z'],
    ['2024-02-29', 86400, '2024-02-29T16:00:00Z'],
  ])('converts %s + %s elapsed seconds to %s', (serviceDate, seconds, expected) => {
    expect(scheduledServiceDayInstant(serviceDate, seconds)).toBe(expected);
  });

  it('uses the GTFS noon-minus-twelve-hours base across a historical offset change', () => {
    // IANA Asia/Singapore changed from +07:30 to +09:00 on 1942-02-16.
    // A noon-based service-day zero differs from that date's first wall-clock instant.
    expect(scheduledServiceDayInstant('1942-02-16', 0)).toBe(
      '1942-02-15T15:00:00Z',
    );
    expect(scheduledServiceDayInstant('1942-02-16', 43200)).toBe(
      '1942-02-16T03:00:00Z',
    );
  });

  it('adds elapsed seconds rather than calendar days across an offset change', () => {
    // IANA Asia/Singapore changed from +07:30 to +08:00 at 1981-12-31T16:00Z.
    expect(scheduledServiceDayInstant('1981-12-31', 86400)).toBe(
      '1981-12-31T16:30:00Z',
    );
    expect(scheduledServiceDayInstant('1982-01-01', 0)).toBe(
      '1981-12-31T16:00:00Z',
    );
  });

  it('merges instants from independently enabled service dates in chronological order', () => {
    const calendar = ScheduledServiceCalendarSchema.parse({
      providerCalendarId: 'SYNTHETIC',
      weekly: null,
      exceptions: [
        { date: '2026-01-01', available: true },
        { date: '2026-01-02', available: true },
      ],
    });
    const departures = [
      { serviceDate: '2026-01-01', seconds: 90000, id: 'previous-25h' },
      { serviceDate: '2026-01-02', seconds: 1800, id: 'current-00h30' },
    ]
      .filter((item) => isScheduledServiceDate(calendar, item.serviceDate))
      .map((item) => ({
        ...item,
        instant: scheduledServiceDayInstant(item.serviceDate, item.seconds),
      }))
      .sort((a, b) => Temporal.Instant.compare(a.instant, b.instant));
    expect(
      departures.map((item) => ({ id: item.id, instant: item.instant })),
    ).toEqual([
      { id: 'current-00h30', instant: '2026-01-01T16:30:00Z' },
      { id: 'previous-25h', instant: '2026-01-01T17:00:00Z' },
    ]);
  });

  it('retains a previous-day trip when the new civil date is removed by an exception', () => {
    const calendar = ScheduledServiceCalendarSchema.parse({
      providerCalendarId: 'SYNTHETIC',
      weekly: null,
      exceptions: [
        { date: '2026-01-01', available: true },
        { date: '2026-01-02', available: false },
      ],
    });
    const candidates = [
      { serviceDate: '2026-01-01', seconds: 90000 },
      { serviceDate: '2026-01-02', seconds: 3600 },
    ];
    const active = candidates.filter((item) =>
      isScheduledServiceDate(calendar, item.serviceDate),
    );
    expect(active).toEqual([{ serviceDate: '2026-01-01', seconds: 90000 }]);
    expect(
      scheduledServiceDayInstant(
        active[0]?.serviceDate ?? '',
        active[0]?.seconds ?? -1,
      ),
    ).toBe('2026-01-01T17:00:00Z');
  });

  it('converts a typed source offset without changing source identity, access or precision', () => {
    const stop = ScheduledStopTimeSchema.parse({
      providerTripId: 'T',
      providerStopId: 'P',
      stopSequence: '09007199254740993',
      arrivalSeconds: 87000,
      departureSeconds: 90123,
      pickupType: 1,
      dropOffType: 0,
      timepoint: 0,
    });
    const before = JSON.stringify(stop);
    if (stop.departureSeconds === null) throw new Error('Missing fixture');
    expect(
      scheduledServiceDayInstant('2026-01-01', stop.departureSeconds),
    ).toBe('2026-01-01T17:02:03Z');
    expect(JSON.stringify(stop)).toBe(before);
  });

  it.each([
    '',
    '2026-02-29',
    '2026-04-31',
    '2026-1-01',
    '20260101',
    '2026-01-01T00:00:00Z',
  ])('rejects a non-civil or impossible service date: %s', (date) => {
    expect(() => scheduledServiceDayInstant(date, 0)).toThrow();
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects a nonrepresentable source offset: %s', (seconds) => {
    expect(() => scheduledServiceDayInstant('2026-01-01', seconds)).toThrow();
  });

  it('rejects offsets beyond the temporal range instead of wrapping or returning an invalid instant', () => {
    expect(() =>
      scheduledServiceDayInstant('2026-01-01', Number.MAX_SAFE_INTEGER),
    ).toThrow(RangeError);
  });
});
