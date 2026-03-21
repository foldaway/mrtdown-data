import { describe, expect, test } from 'vitest';
import type { PeriodRecurring } from '../schema/issue/period.js';
import { normalizeRecurringPeriod } from './normalizeRecurringPeriod.js';

function makeRecurringPeriod(
  overrides: Partial<PeriodRecurring> = {},
): PeriodRecurring {
  return {
    kind: 'recurring',
    frequency: 'daily',
    startAt: '2025-01-01T00:00:00+08:00',
    endAt: '2025-01-03T23:59:59+08:00',
    daysOfWeek: null,
    timeWindow: {
      startAt: '08:00:00',
      endAt: '10:00:00',
    },
    timeZone: 'Asia/Singapore',
    excludedDates: null,
    ...overrides,
  };
}

describe('normalizeRecurringPeriod', () => {
  test('normalizes a bounded daily recurring period into fixed periods', () => {
    const period = makeRecurringPeriod();

    const fixed = normalizeRecurringPeriod(period);

    expect(fixed).toHaveLength(3);
    expect(fixed).toEqual([
      {
        kind: 'fixed',
        startAt: '2025-01-01T08:00:00.000+08:00',
        endAt: '2025-01-01T10:00:00.000+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-02T08:00:00.000+08:00',
        endAt: '2025-01-02T10:00:00.000+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-03T08:00:00.000+08:00',
        endAt: '2025-01-03T10:00:00.000+08:00',
      },
    ]);
  });

  test('filters recurrence by configured daysOfWeek', () => {
    const period = makeRecurringPeriod({
      startAt: '2025-01-01T00:00:00+08:00', // Wednesday
      endAt: '2025-01-10T23:59:59+08:00',
      frequency: 'weekly',
      daysOfWeek: ['MO', 'WE', 'FR'],
    });

    const fixed = normalizeRecurringPeriod(period);

    expect(fixed.map((item) => item.startAt)).toEqual([
      '2025-01-01T08:00:00.000+08:00',
      '2025-01-03T08:00:00.000+08:00',
      '2025-01-06T08:00:00.000+08:00',
      '2025-01-08T08:00:00.000+08:00',
      '2025-01-10T08:00:00.000+08:00',
    ]);
  });

  test('excludes specific dates from recurrence', () => {
    const period = makeRecurringPeriod({
      timeWindow: {
        startAt: '00:00:00',
        endAt: '01:00:00',
      },
      excludedDates: ['2025-01-02'],
    });

    const fixed = normalizeRecurringPeriod(period);

    expect(fixed).toEqual([
      {
        kind: 'fixed',
        startAt: '2025-01-01T00:00:00.000+08:00',
        endAt: '2025-01-01T01:00:00.000+08:00',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-03T00:00:00.000+08:00',
        endAt: '2025-01-03T01:00:00.000+08:00',
      },
    ]);
  });

  test('returns start and end timestamps in Singapore timezone', () => {
    const period = makeRecurringPeriod({
      startAt: '2025-01-01T00:00:00Z',
      endAt: '2025-01-02T23:59:59Z',
    });

    const fixed = normalizeRecurringPeriod(period);

    expect(fixed).toHaveLength(2);
    for (const item of fixed) {
      expect(item.startAt.endsWith('+08:00')).toBe(true);
      expect(item.endAt?.endsWith('+08:00')).toBe(true);
    }
  });
});
