import { describe, expect, it } from 'vitest';
import type { ScheduleTables } from './schedule.js';
import { scheduledTimetableFromGtfs } from './scheduledTimetable.js';

function source(): ScheduleTables {
  return {
    'agency.txt': [{ agency_id: 'A', agency_timezone: 'Asia/Singapore' }],
    'routes.txt': [{ route_id: 'R', agency_id: 'A' }],
    'stops.txt': [{ stop_id: 'P' }, { stop_id: 'Q' }],
    'calendar_dates.txt': ['UNUSED', 'C'].map((service_id) => ({
      service_id,
      date: '20260101',
      exception_type: '1',
    })),
    'trips.txt': ['z', 'Z'].map((trip_id) => ({
      trip_id,
      route_id: 'R',
      service_id: 'C',
    })),
    'stop_times.txt': ['z', 'Z'].flatMap((trip_id) =>
      ['P', 'Q'].map((stop_id, index) => ({
        trip_id,
        stop_id,
        stop_sequence: String(index),
        arrival_time: '25:00:00',
        departure_time: '25:00:00',
      })),
    ),
  };
}

describe('scheduledTimetableFromGtfs', () => {
  it('assembles every trip and calendar deterministically, retaining unused definitions', () => {
    const tables = source();
    const before = JSON.stringify(tables);
    const result = scheduledTimetableFromGtfs(tables);
    expect(result.schemaVersion).toBe(1);
    expect(result.timeZone).toBe('Asia/Singapore');
    expect(
      result.calendars.map((calendar) => calendar.providerCalendarId),
    ).toEqual(['C', 'UNUSED']);
    expect(result.trips.map((trip) => trip.providerTripId)).toEqual(['Z', 'z']);
    expect(
      result.trips[0].stopTimes.map((stop) => stop.departureSeconds),
    ).toEqual([90000, 90000]);
    const reordered = Object.fromEntries(
      Object.entries(tables)
        .reverse()
        .map(([name, rows]) => [name, [...rows].reverse()]),
    );
    expect(JSON.stringify(scheduledTimetableFromGtfs(reordered))).toBe(
      JSON.stringify(result),
    );
    expect(JSON.stringify(tables)).toBe(before);
  });

  it('rejects invalid unused calendars as well as broken trip references', () => {
    const tables = source();
    tables['calendar_dates.txt'][0].date = '20260230';
    expect(() => scheduledTimetableFromGtfs(tables)).toThrow();
    tables['calendar_dates.txt'][0].date = '20260101';
    tables['trips.txt'][0].service_id = 'MISSING';
    expect(() => scheduledTimetableFromGtfs(tables)).toThrow(
      'unknown calendar',
    );
  });

  it('refuses inputs whose timezone or frequency semantics cannot be represented', () => {
    const tables = source();
    tables['agency.txt'].push({ agency_id: 'OTHER', agency_timezone: 'UTC' });
    expect(() => scheduledTimetableFromGtfs(tables)).toThrow('Asia/Singapore');
    tables['agency.txt'] = [];
    expect(() => scheduledTimetableFromGtfs(tables)).toThrow('Asia/Singapore');
    tables['agency.txt'] = source()['agency.txt'];
    tables['frequencies.txt'] = [{ trip_id: 'z' }];
    expect(() => scheduledTimetableFromGtfs(tables)).toThrow('frequency-based');
  });
});
