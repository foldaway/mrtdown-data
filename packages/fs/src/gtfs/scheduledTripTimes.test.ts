import { describe, expect, it } from 'vitest';
import type { ScheduleTables } from './schedule.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';

function source(): ScheduleTables {
  return {
    'agency.txt': [{ agency_id: 'A' }],
    'routes.txt': [{ route_id: 'R', agency_id: 'A' }],
    'stops.txt': [{ stop_id: 'P' }, { stop_id: 'Q', location_type: '0' }],
    'calendar_dates.txt': [
      { service_id: 'C', date: '20260101', exception_type: '1' },
    ],
    'trips.txt': [
      { trip_id: 'z', route_id: 'R', service_id: 'C' },
      { trip_id: 'Z', route_id: 'R', service_id: 'C' },
    ],
    'stop_times.txt': ['z', 'Z'].flatMap((trip_id) => [
      {
        trip_id,
        stop_id: 'P',
        stop_sequence: '9007199254740994',
        arrival_time: '25:00:00',
        departure_time: '25:00:00',
        drop_off_type: '3',
      },
      {
        trip_id,
        stop_id: 'Q',
        stop_sequence: '9007199254740993',
        arrival_time: '',
        departure_time: '',
        timepoint: '0',
      },
      {
        trip_id,
        stop_id: 'P',
        stop_sequence: '09007199254740992',
        arrival_time: '23:59:00',
        departure_time: '24:00:00',
        pickup_type: '1',
      },
    ]),
  };
}

describe('scheduledTripTimesFromGtfs', () => {
  it('assembles every source trip in deterministic occurrence order, retaining repeated visits and source rules', () => {
    const tables = source();
    const before = JSON.stringify(tables);
    const result = scheduledTripTimesFromGtfs(tables);
    expect(result.map((trip) => trip.providerTripId)).toEqual(['Z', 'z']);
    expect(result[0]).toEqual({
      providerTripId: 'Z',
      providerRouteId: 'R',
      providerCalendarId: 'C',
      stopTimes: [
        {
          providerTripId: 'Z',
          providerStopId: 'P',
          stopSequence: '09007199254740992',
          arrivalSeconds: 86340,
          departureSeconds: 86400,
          pickupType: 1,
          dropOffType: 0,
          timepoint: 1,
        },
        {
          providerTripId: 'Z',
          providerStopId: 'Q',
          stopSequence: '9007199254740993',
          arrivalSeconds: null,
          departureSeconds: null,
          pickupType: 0,
          dropOffType: 0,
          timepoint: 0,
        },
        {
          providerTripId: 'Z',
          providerStopId: 'P',
          stopSequence: '9007199254740994',
          arrivalSeconds: 90000,
          departureSeconds: 90000,
          pickupType: 0,
          dropOffType: 3,
          timepoint: 1,
        },
      ],
    });
    expect(before).toBe(JSON.stringify(tables));
    const reordered = Object.fromEntries(
      Object.entries(tables)
        .reverse()
        .map(([name, rows]) => [name, [...rows].reverse()]),
    );
    expect(scheduledTripTimesFromGtfs(reordered)).toEqual(result);
  });
  it.each([
    ['trips.txt', 'route_id', 'MISSING', 'unknown route'],
    ['trips.txt', 'service_id', 'MISSING', 'unknown calendar'],
    ['stop_times.txt', 'trip_id', 'MISSING', 'unknown trip'],
    ['stop_times.txt', 'stop_id', 'MISSING', 'unknown stop'],
  ])('rejects dangling source references in %s.%s', (table, field, value, message) => {
    const tables = source();
    tables[table][0][field] = value;
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(message);
  });
  it.each([
    'trips.txt',
    'routes.txt',
    'stops.txt',
  ])('rejects duplicate source identifiers in %s', (table) => {
    const tables = source();
    tables[table].push({ ...tables[table][0] });
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow('duplicate');
  });
  it('rejects decimal aliases instead of dropping a duplicate occurrence', () => {
    const tables = source();
    tables['stop_times.txt'].push({
      ...tables['stop_times.txt'][0],
      stop_sequence: '09007199254740994',
    });
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'duplicate stop sequence',
    );
  });
  it.each([
    '1',
    '2',
    '3',
    '4',
    'invalid',
  ])('rejects a referenced location_type=%s', (location_type) => {
    const tables = source();
    tables['stops.txt'][0].location_type = location_type;
    // Entrances need a station parent to pass the existing structural audit.
    tables['stops.txt'][0].parent_station = 'STATION';
    tables['stops.txt'].push({ stop_id: 'STATION', location_type: '1' });
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'not a stop/platform',
    );
  });
  it('validates actual calendar dates, not just their eight-digit shape', () => {
    const tables = source();
    tables['calendar_dates.txt'][0].date = '20260230';
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow();
  });
  it('rejects trips without stop times or with only one occurrence', () => {
    const tables = source();
    tables['stop_times.txt'] = [];
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow('no stop times');
    tables['stop_times.txt'] = source()['stop_times.txt'].filter(
      (row) => row.stop_id === 'Q',
    );
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'Invalid GTFS trip timing Z',
    );
  });
  it('rejects missing boundary times and chronology through approximate gaps', () => {
    const tables = source();
    const final = tables['stop_times.txt'][0];
    final.timepoint = '0';
    final.arrival_time = '';
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'Invalid GTFS trip timing z',
    );
    final.arrival_time = '23:00:00';
    // Missing prior departure hides this regression from the older structural audit.
    tables['stop_times.txt'][2].departure_time = '';
    tables['stop_times.txt'][2].timepoint = '0';
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'Invalid GTFS trip timing z',
    );
  });
  it('rejects unsupported on-demand rows and unsafe offsets without emitting partial results', () => {
    const tables = source();
    tables['stop_times.txt'][0].location_id = 'ZONE';
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'Invalid GTFS trip timing z',
    );
    delete tables['stop_times.txt'][0].location_id;
    tables['stop_times.txt'][0].departure_time = '9999999999999999999:00:00';
    expect(() => scheduledTripTimesFromGtfs(tables)).toThrow(
      'Invalid GTFS trip timing z',
    );
  });
});
