import { isScheduledServiceDate } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { activeServiceDates } from './reconciliationEvidence.js';
import type { ScheduleTables } from './schedule.js';
import { scheduledServiceCalendarFromGtfs } from './scheduledServiceCalendar.js';

function source() {
  return {
    service_id: 'SOURCE_CALENDAR',
    start_date: '20260101',
    end_date: '20260131',
    monday: '1',
    tuesday: '1',
    wednesday: '1',
    thursday: '1',
    friday: '1',
    saturday: '0',
    sunday: '0',
  };
}

describe('scheduledServiceCalendarFromGtfs', () => {
  it('preserves provider identity and all seven literal weekday flags', () => {
    const value = scheduledServiceCalendarFromGtfs(
      { 'calendar.txt': [source()] },
      'SOURCE_CALENDAR',
    );
    expect(value).toEqual({
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
    });
  });
  it('matches the existing evidence calendar across actual dates and exceptions', () => {
    const tables = {
      'calendar.txt': [source()],
      'calendar_dates.txt': [
        {
          service_id: 'SOURCE_CALENDAR',
          date: '20260105',
          exception_type: '2',
        },
        {
          service_id: 'SOURCE_CALENDAR',
          date: '20260110',
          exception_type: '1',
        },
        {
          service_id: 'SOURCE_CALENDAR',
          date: '20260207',
          exception_type: '1',
        },
      ],
    };
    const value = scheduledServiceCalendarFromGtfs(tables, 'SOURCE_CALENDAR');
    const expected = new Set(activeServiceDates(tables, 'SOURCE_CALENDAR'));
    for (let day = 1; day <= 31; day++) {
      const date = `2026-01-${String(day).padStart(2, '0')}`;
      expect(isScheduledServiceDate(value, date)).toBe(expected.has(date));
    }
    expect(isScheduledServiceDate(value, '2026-02-07')).toBe(
      expected.has('2026-02-07'),
    );
  });
  it('supports calendars defined solely by exceptions and preserves explicit removals', () => {
    const value = scheduledServiceCalendarFromGtfs(
      {
        'calendar_dates.txt': [
          { service_id: 'DATE_ONLY', date: '20260105', exception_type: '1' },
          { service_id: 'DATE_ONLY', date: '20260106', exception_type: '2' },
        ],
      },
      'DATE_ONLY',
    );
    expect(value.weekly).toBeNull();
    expect(value.exceptions).toEqual([
      { date: '2026-01-05', available: true },
      { date: '2026-01-06', available: false },
    ]);
    expect(isScheduledServiceDate(value, '2026-01-05')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-01-06')).toBe(false);
  });
  it('normalizes reordered exception rows without modifying source records', () => {
    const tables = {
      'calendar.txt': [source()],
      'calendar_dates.txt': [
        {
          service_id: 'SOURCE_CALENDAR',
          date: '20260110',
          exception_type: '1',
        },
        {
          service_id: 'SOURCE_CALENDAR',
          date: '20260105',
          exception_type: '2',
        },
      ],
    };
    const before = JSON.stringify(tables);
    const result = scheduledServiceCalendarFromGtfs(tables, 'SOURCE_CALENDAR');
    expect(
      scheduledServiceCalendarFromGtfs(
        {
          ...tables,
          'calendar_dates.txt': [...tables['calendar_dates.txt']].reverse(),
        },
        'SOURCE_CALENDAR',
      ),
    ).toEqual(result);
    expect(JSON.stringify(tables)).toBe(before);
  });
  it('rejects missing or duplicate provider definitions instead of choosing a row', () => {
    expect(() => scheduledServiceCalendarFromGtfs({}, 'MISSING')).toThrow(
      'Unknown GTFS calendar',
    );
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [source(), source()] },
        'SOURCE_CALENDAR',
      ),
    ).toThrow('Duplicate GTFS calendar');
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [{ ...source(), service_id: '' }] },
        '',
      ),
    ).toThrow();
  });
  it.each([
    '1',
    '2',
  ])('rejects repeated exception dates with type %s', (exception_type) => {
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        {
          'calendar_dates.txt': [
            { service_id: 'DATE_ONLY', date: '20260105', exception_type: '1' },
            { service_id: 'DATE_ONLY', date: '20260105', exception_type },
          ],
        },
        'DATE_ONLY',
      ),
    ).toThrow('Duplicate calendar exception date');
  });
  it.each([
    '',
    '2',
    'true',
    '01',
  ])('rejects a nonliteral weekday flag: %s', (monday) => {
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [{ ...source(), monday }] },
        'SOURCE_CALENDAR',
      ),
    ).toThrow('Invalid GTFS monday');
  });
  it('rejects absent weekday flags rather than defaulting to no service', () => {
    const row: Record<string, string> = source();
    delete row.sunday;
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [row] },
        'SOURCE_CALENDAR',
      ),
    ).toThrow('Invalid GTFS sunday');
  });
  it.each([
    '',
    '0',
    '3',
    '01',
  ])('rejects invalid exception type: %s', (exception_type) => {
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        {
          'calendar_dates.txt': [
            { service_id: 'DATE_ONLY', date: '20260105', exception_type },
          ],
        },
        'DATE_ONLY',
      ),
    ).toThrow('Invalid GTFS exception_type');
  });
  it.each([
    '2026-01-01',
    '2026010',
    '20260230',
    '20260229',
    'not a date',
  ])('rejects malformed or impossible source dates: %s', (start_date) => {
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [{ ...source(), start_date }] },
        'SOURCE_CALENDAR',
      ),
    ).toThrow();
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        {
          'calendar_dates.txt': [
            { service_id: 'DATE_ONLY', date: start_date, exception_type: '1' },
          ],
        },
        'DATE_ONLY',
      ),
    ).toThrow();
  });
  it('rejects inverted bounds and accepts same-day bounds', () => {
    expect(() =>
      scheduledServiceCalendarFromGtfs(
        { 'calendar.txt': [{ ...source(), end_date: '20251231' }] },
        'SOURCE_CALENDAR',
      ),
    ).toThrow('end date cannot precede');
    const value = scheduledServiceCalendarFromGtfs(
      { 'calendar.txt': [{ ...source(), end_date: '20260101' }] },
      'SOURCE_CALENDAR',
    );
    expect(isScheduledServiceDate(value, '2026-01-01')).toBe(true);
    expect(isScheduledServiceDate(value, '2026-01-02')).toBe(false);
  });
  it('scopes parsing to the requested calendar without changing unrelated source rows', () => {
    const tables: ScheduleTables = {
      'calendar.txt': [source(), { service_id: 'OTHER', monday: 'invalid' }],
      'calendar_dates.txt': [
        { service_id: 'OTHER', date: 'bad', exception_type: 'invalid' },
      ],
    };
    const before = JSON.stringify(tables);
    expect(
      scheduledServiceCalendarFromGtfs(tables, 'SOURCE_CALENDAR')
        .providerCalendarId,
    ).toBe('SOURCE_CALENDAR');
    expect(JSON.stringify(tables)).toBe(before);
  });
});
