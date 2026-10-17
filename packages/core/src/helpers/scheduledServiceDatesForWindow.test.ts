import { describe, expect, it } from 'vitest';
import type { ScheduledServiceCalendar } from '../schema/ScheduledServiceCalendar.js';
import { scheduledServiceDatesForWindow } from './scheduledServiceDatesForWindow.js';

function calendar(...dates: string[]): ScheduledServiceCalendar {
  return {
    providerCalendarId: 'C',
    weekly: null,
    exceptions: dates.map((date) => ({ date, available: true })),
  };
}

describe('scheduledServiceDatesForWindow', () => {
  it('includes earlier service dates until their maximum offset is outside the window', () => {
    const rules = calendar('2026-01-01', '2026-01-02');
    expect(
      scheduledServiceDatesForWindow(
        rules,
        {
          startInstant: '2026-01-02T00:30:00+08:00',
          endInstant: '2026-01-02T01:30:00+08:00',
        },
        90000,
      ),
    ).toEqual(['2026-01-01', '2026-01-02']);
    expect(
      scheduledServiceDatesForWindow(
        rules,
        {
          startInstant: '2026-01-02T01:30:00+08:00',
          endInstant: '2026-01-02T02:00:00+08:00',
        },
        90000,
      ),
    ).toEqual(['2026-01-02']);
    expect(
      scheduledServiceDatesForWindow(
        rules,
        {
          startInstant: '2026-01-01T23:30:00+08:00',
          endInstant: '2026-01-02T00:00:00+08:00',
        },
        90000,
      ),
    ).toEqual(['2026-01-01']);
  });

  it('looks back more than one day when source offsets exceed 48 hours', () => {
    expect(
      scheduledServiceDatesForWindow(
        calendar('2026-01-01', '2026-01-02', '2026-01-03'),
        {
          startInstant: '2026-01-03T00:00:00+08:00',
          endInstant: '2026-01-03T00:30:00+08:00',
        },
        174600,
      ),
    ).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('respects removals and includes additions outside the weekly bounds', () => {
    const rules: ScheduledServiceCalendar = {
      providerCalendarId: 'C',
      weekly: {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        weekdays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        },
      },
      exceptions: [
        { date: '2026-01-02', available: false },
        { date: '2026-03-01', available: true },
      ],
    };
    expect(
      scheduledServiceDatesForWindow(
        rules,
        {
          startInstant: '2026-01-02T00:30:00+08:00',
          endInstant: '2026-01-02T01:30:00+08:00',
        },
        90000,
      ),
    ).toEqual(['2026-01-01']);
    expect(
      scheduledServiceDatesForWindow(
        rules,
        {
          startInstant: '2026-03-01T05:00:00+08:00',
          endInstant: '2026-03-01T06:00:00+08:00',
        },
        90000,
      ),
    ).toEqual(['2026-03-01']);
  });

  it('uses the historical noon anchor when zero falls on the previous civil date', () => {
    expect(
      scheduledServiceDatesForWindow(
        calendar('1942-02-16'),
        {
          startInstant: '1942-02-15T15:00:00Z',
          endInstant: '1942-02-15T15:00:01Z',
        },
        0,
      ),
    ).toEqual(['1942-02-16']);
  });
});
