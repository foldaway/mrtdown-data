import { describe, expect, it } from 'vitest';
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
