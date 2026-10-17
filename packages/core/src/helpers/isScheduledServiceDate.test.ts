import { describe, expect, it } from 'vitest';
import {
  type ScheduledServiceCalendar,
  ScheduledServiceCalendarSchema,
} from '../schema/ScheduledServiceCalendar.js';
import { isScheduledServiceDate } from './isScheduledServiceDate.js';

function calendar(): ScheduledServiceCalendar {
  return {
    providerCalendarId: 'SOURCE_CALENDAR',
    weekly: {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
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
    exceptions: [],
  };
}
function weekly() {
  const value = calendar();
  if (!value.weekly) throw new Error('Missing fixture');
  return value.weekly;
}

describe('compact service calendars', () => {
  it('includes both source range boundaries without extending the calendar', () => {
    const value = calendar();
    value.weekly = {
      ...weekly(),
      weekdays: { ...weekly().weekdays, saturday: true, sunday: true },
    };
    expect(isScheduledServiceDate(value, '2025-12-31')).toBe(false);
    expect(isScheduledServiceDate(value, '2026-01-01')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-01-31')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-02-01')).toBe(false);
  });
  it.each([
    ['monday', '2026-01-05'],
    ['tuesday', '2026-01-06'],
    ['wednesday', '2026-01-07'],
    ['thursday', '2026-01-08'],
    ['friday', '2026-01-09'],
    ['saturday', '2026-01-10'],
    ['sunday', '2026-01-11'],
  ] as const)('tests the %s flag against the civil date', (day, date) => {
    const value = calendar();
    const rules = weekly();
    for (const key of Object.keys(
      rules.weekdays,
    ) as (keyof typeof rules.weekdays)[])
      rules.weekdays[key] = false;
    value.weekly = rules;
    expect(isScheduledServiceDate(value, date)).toBe(false);
    rules.weekdays[day] = true;
    expect(isScheduledServiceDate(value, date)).toBe(true);
  });
  it('applies additions and removals before weekly bounds and weekday rules', () => {
    const value = calendar();
    value.exceptions = [
      { date: '2026-01-05', available: false },
      { date: '2026-01-10', available: true },
      { date: '2026-02-07', available: true },
    ];
    expect(isScheduledServiceDate(value, '2026-01-05')).toBe(false);
    expect(isScheduledServiceDate(value, '2026-01-10')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-02-07')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-02-08')).toBe(false);
  });
  it('supports date-only calendars and explicit removal-only inactive calendars', () => {
    const value: ScheduledServiceCalendar = {
      providerCalendarId: 'DATE_ONLY',
      weekly: null,
      exceptions: [
        { date: '2026-01-05', available: true },
        { date: '2026-01-06', available: false },
      ],
    };
    expect(isScheduledServiceDate(value, '2026-01-05')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-01-06')).toBe(false);
    expect(isScheduledServiceDate(value, '2026-01-07')).toBe(false);
    value.exceptions = [{ date: '2026-01-05', available: false }];
    expect(isScheduledServiceDate(value, '2026-01-05')).toBe(false);
  });
  it('does not infer holiday service from a provider identifier', () => {
    const value = calendar();
    value.providerCalendarId = 'SERVICE_PH';
    value.weekly = {
      ...weekly(),
      endDate: '2026-12-31',
      weekdays: {
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false,
        saturday: false,
        sunday: true,
      },
    };
    expect(isScheduledServiceDate(value, '2026-05-01')).toBe(false);
    expect(isScheduledServiceDate(value, '2026-05-03')).toBe(true);
  });
  it('handles Gregorian leap dates and wide bounds without expanding date arrays', () => {
    const value = calendar();
    value.weekly = {
      ...weekly(),
      startDate: '0001-01-01',
      endDate: '9999-12-31',
      weekdays: { ...weekly().weekdays, saturday: true, sunday: true },
    };
    expect(isScheduledServiceDate(value, '2024-02-29')).toBe(true);
    expect(isScheduledServiceDate(value, '9999-12-31')).toBe(true);
  });
  it.each([
    '2026-02-29',
    '2026-04-31',
    '2026-1-05',
    '20260105',
    '2026-01-05T00:00:00Z',
  ])('rejects a non-civil or impossible query date: %s', (date) => {
    expect(() => isScheduledServiceDate(calendar(), date)).toThrow();
  });
  it('normalizes exception order while leaving the caller calendar untouched', () => {
    const value = calendar();
    value.exceptions = [
      { date: '2026-01-10', available: true },
      { date: '2026-01-05', available: false },
    ];
    const before = JSON.stringify(value);
    const parsed = ScheduledServiceCalendarSchema.parse(value);
    expect(parsed.exceptions.map((item) => item.date)).toEqual([
      '2026-01-05',
      '2026-01-10',
    ]);
    expect(
      ScheduledServiceCalendarSchema.parse({
        ...value,
        exceptions: [...value.exceptions].reverse(),
      }),
    ).toEqual(parsed);
    isScheduledServiceDate(value, '2026-01-10');
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each([
    true,
    false,
  ])('rejects duplicate exception dates even when availability repeats: %s', (available) => {
    const value = calendar();
    value.exceptions = [
      { date: '2026-01-05', available: true },
      { date: '2026-01-05', available },
    ];
    expect(() => ScheduledServiceCalendarSchema.parse(value)).toThrow(
      'Duplicate calendar exception date',
    );
    expect(() => isScheduledServiceDate(value, '2026-01-05')).toThrow(
      'Duplicate calendar exception date',
    );
  });
  it('rejects inverted bounds and absent definitions, preserving explicit inactive weekly rules', () => {
    const value = calendar();
    value.weekly = { ...weekly(), endDate: '2025-12-31' };
    expect(() => isScheduledServiceDate(value, '2026-01-05')).toThrow(
      'end date cannot precede',
    );
    expect(() =>
      ScheduledServiceCalendarSchema.parse({ ...value, weekly: null }),
    ).toThrow('requires weekly rules');
    value.weekly = weekly();
    for (const key of Object.keys(
      value.weekly.weekdays,
    ) as (keyof typeof value.weekly.weekdays)[])
      value.weekly.weekdays[key] = false;
    expect(isScheduledServiceDate(value, '2026-01-05')).toBe(false);
  });
  it('rejects malformed calendar fields and stray publication metadata', () => {
    expect(() =>
      ScheduledServiceCalendarSchema.parse({
        ...calendar(),
        providerCalendarId: '',
      }),
    ).toThrow();
    expect(() =>
      ScheduledServiceCalendarSchema.parse({
        ...calendar(),
        weekly: { ...weekly(), startDate: '20260230' },
      }),
    ).toThrow();
    expect(() =>
      ScheduledServiceCalendarSchema.parse({
        ...calendar(),
        weekly: {
          ...weekly(),
          weekdays: { ...weekly().weekdays, monday: '1' },
        },
      }),
    ).toThrow();
    expect(() =>
      ScheduledServiceCalendarSchema.parse({
        ...calendar(),
        exceptions: [{ date: '2026-01-05', available: '1' }],
      }),
    ).toThrow();
    expect(() =>
      ScheduledServiceCalendarSchema.parse({
        ...calendar(),
        generationEligible: true,
      }),
    ).toThrow();
  });
});
