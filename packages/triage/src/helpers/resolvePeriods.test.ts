import type { Period } from '@mrtdown/core';
import { describe, expect, test } from 'vitest';
import { resolvePeriods } from './resolvePeriods.js';

describe('resolvePeriods', () => {
  const asOf = '2025-01-01T12:00:00+08:00';
  const factEndedPeriod: Period[] = [
    {
      kind: 'fixed',
      startAt: '2025-01-01T08:00:00+08:00',
      endAt: '2025-01-01T09:00:00+08:00',
    },
  ];

  test('keeps fact-ended period in all modes', () => {
    const canonical = resolvePeriods({
      periods: factEndedPeriod,
      asOf,
      mode: { kind: 'canonical' },
    });
    const operational = resolvePeriods({
      periods: factEndedPeriod,
      asOf,
      mode: { kind: 'operational' },
    });

    expect(canonical[0]).toMatchObject({
      startAt: '2025-01-01T08:00:00+08:00',
      endAt: '2025-01-01T09:00:00+08:00',
      endAtResolved: '2025-01-01T09:00:00+08:00',
      endAtSource: 'fact',
    });
    expect(operational[0].endAtSource).toBe('fact');
  });

  test('open period with no evidence and no crowd remains open', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf,
      mode: { kind: 'operational' },
    });

    expect(result[0]).toMatchObject({
      endAt: null,
      endAtResolved: null,
      endAtSource: 'none',
    });
  });

  test('open period infers end from evidence timeout only', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf: '2025-01-02T01:00:00+08:00', // Past inferred end-of-day (2025-01-02T00:00)
      mode: {
        kind: 'operational',
        lastEvidenceAt: '2025-01-01T09:00:00+08:00',
      },
    });

    expect(result[0]).toMatchObject({
      endAtResolved: '2025-01-02T00:00:00.000+08:00',
      endAtSource: 'inferred',
      endAtReason: 'evidence_timeout',
    });
  });

  test('crowd exited inference wins over evidence timeout', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf: '2025-01-02T01:00:00+08:00', // Past inferred end-of-day (2025-01-02T00:00)
      mode: {
        kind: 'operational',
        lastEvidenceAt: '2025-01-01T09:00:00+08:00',
        crowd: {
          activeNow: false,
          exitedAt: '2025-01-01T10:15:00+08:00',
        },
      },
    });

    expect(result[0]).toMatchObject({
      endAtResolved: '2025-01-02T00:00:00.000+08:00',
      endAtSource: 'inferred',
      endAtReason: 'crowd_decay',
    });
  });

  test('crowd.activeNow=true prevents crowd-based inference fallback', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf,
      mode: {
        kind: 'operational',
        crowd: {
          activeNow: true,
          lastActiveAt: '2025-01-01T09:30:00+08:00',
        },
      },
    });

    expect(result[0]).toMatchObject({
      endAtResolved: null,
      endAtSource: 'none',
    });
  });

  test('clamps inferred end to maxInferredDurationMinutes', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf: '2025-01-02T13:00:00+08:00',
      mode: {
        kind: 'operational',
        lastEvidenceAt: '2025-01-02T10:00:00+08:00',
        config: {
          maxInferredDurationMinutes: 60,
        },
      },
    });

    expect(result[0]).toMatchObject({
      endAtResolved: '2025-01-01T09:00:00.000+08:00',
      endAtSource: 'inferred',
      endAtReason: 'evidence_timeout',
    });
  });

  test('does not close period when inferred end is later than asOf', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T08:00:00+08:00',
          endAt: null,
        },
      ],
      asOf: '2025-01-01T10:00:00+08:00',
      mode: {
        kind: 'operational',
        lastEvidenceAt: '2025-01-01T09:30:00+08:00',
      },
    });

    expect(result[0]).toMatchObject({
      endAtResolved: null,
      endAtSource: 'none',
    });
  });

  test('expands recurring periods into fixed periods in canonical mode', () => {
    const result = resolvePeriods({
      periods: [
        {
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
        },
      ],
      asOf,
      mode: { kind: 'canonical' },
    });

    expect(result).toEqual([
      {
        kind: 'fixed',
        startAt: '2025-01-01T08:00:00.000+08:00',
        endAt: '2025-01-01T10:00:00.000+08:00',
        endAtResolved: '2025-01-01T10:00:00.000+08:00',
        endAtSource: 'fact',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-02T08:00:00.000+08:00',
        endAt: '2025-01-02T10:00:00.000+08:00',
        endAtResolved: '2025-01-02T10:00:00.000+08:00',
        endAtSource: 'fact',
      },
      {
        kind: 'fixed',
        startAt: '2025-01-03T08:00:00.000+08:00',
        endAt: '2025-01-03T10:00:00.000+08:00',
        endAtResolved: '2025-01-03T10:00:00.000+08:00',
        endAtSource: 'fact',
      },
    ]);
  });

  test('sorts normalized recurring periods together with fixed periods', () => {
    const result = resolvePeriods({
      periods: [
        {
          kind: 'fixed',
          startAt: '2025-01-01T07:00:00+08:00',
          endAt: '2025-01-01T07:30:00+08:00',
        },
        {
          kind: 'recurring',
          frequency: 'daily',
          startAt: '2025-01-01T00:00:00+08:00',
          endAt: '2025-01-02T23:59:59+08:00',
          daysOfWeek: null,
          timeWindow: {
            startAt: '08:00:00',
            endAt: '09:00:00',
          },
          timeZone: 'Asia/Singapore',
          excludedDates: null,
        },
      ],
      asOf,
      mode: { kind: 'operational' },
    });

    expect(result.map((period) => period.startAt)).toEqual([
      '2025-01-01T07:00:00+08:00',
      '2025-01-01T08:00:00.000+08:00',
      '2025-01-02T08:00:00.000+08:00',
    ]);
    expect(result.every((period) => period.endAtSource === 'fact')).toBe(true);
  });
});
