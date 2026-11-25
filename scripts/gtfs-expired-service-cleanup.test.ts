import { expect, test } from 'vitest';
import { assessExpiredServiceCleanup } from './gtfs-expired-service-cleanup.mjs';

function fixture() {
  const calendar = (id: string, start = '20260101', end = '20261231') => ({
    service_id: id,
    start_date: start,
    end_date: end,
    monday: '1',
    tuesday: '1',
    wednesday: '1',
    thursday: '1',
    friday: '1',
    saturday: '1',
    sunday: '1',
  });
  const trip = (id: string, service: string) => ({
    trip_id: id,
    service_id: service,
    route_id: 'CCL',
    direction_id: '1',
  });
  const call = (id: string, time = '25:00:00') => ({
    trip_id: id,
    stop_id: 'CC11_B',
    stop_sequence: '1',
    arrival_time: time,
    departure_time: time,
  });
  const baseline = {
    'calendar.txt': [
      calendar('regular'),
      calendar('special', '20261114', '20261114'),
    ],
    'calendar_dates.txt': [
      { service_id: 'regular', date: '20261114', exception_type: '2' },
    ],
    'trips.txt': [
      trip('regular-trip', 'regular'),
      trip('special-trip', 'special'),
    ],
    'stop_times.txt': [call('regular-trip'), call('special-trip')],
    'routes.txt': [{ route_id: 'CCL' }],
  };
  const candidate = structuredClone(baseline);
  candidate['calendar.txt'].pop();
  candidate['calendar_dates.txt'] = [];
  candidate['trips.txt'].pop();
  candidate['stop_times.txt'].pop();
  return { baseline, candidate, now: '2026-11-25T08:00:00Z' };
}

test('expired one-day service cleanup is a no-op without changing the retained source', () => {
  const { baseline, candidate, now } = fixture();
  const original = structuredClone(baseline);
  expect(assessExpiredServiceCleanup(baseline, candidate, now)).toEqual({
    serviceDates: ['2026-11-14'],
    removedTrips: 1,
    addedTrips: 0,
    changedTrips: 0,
  });
  expect(baseline).toEqual(original);
});

test('today and future special service remain subject to normal review', () => {
  for (const day of ['20261125', '20261126']) {
    const { baseline, candidate, now } = fixture();
    baseline['calendar.txt'][1].start_date = day;
    baseline['calendar.txt'][1].end_date = day;
    expect(assessExpiredServiceCleanup(baseline, candidate, now)).toBeNull();
  }
});

test('a previous service day cannot expire until its overnight tail finishes in Singapore', () => {
  const { baseline, candidate } = fixture();
  baseline['calendar.txt'][1].start_date = '20261124';
  baseline['calendar.txt'][1].end_date = '20261124';
  baseline['stop_times.txt'][1].arrival_time = '26:00:00';
  baseline['stop_times.txt'][1].departure_time = '26:00:00';
  expect(
    assessExpiredServiceCleanup(baseline, candidate, '2026-11-24T17:59:59Z'),
  ).toBeNull();
  expect(
    assessExpiredServiceCleanup(baseline, candidate, '2026-11-24T18:00:00Z'),
  ).toBeNull();
  expect(
    assessExpiredServiceCleanup(baseline, candidate, '2026-11-24T18:00:01Z')
      ?.serviceDates,
  ).toContain('2026-11-24');
});

test('calendar exception changes today or in the future cannot be a no-op', () => {
  for (const date of ['20261125', '20261126']) {
    const { baseline, candidate, now } = fixture();
    candidate['calendar_dates.txt'].push({
      service_id: 'regular',
      date,
      exception_type: '2',
    });
    expect(assessExpiredServiceCleanup(baseline, candidate, now)).toBeNull();
  }
});

test('calendar bounds protect a Sunday template still usable for weekday holiday substitution', () => {
  const { baseline, candidate } = fixture();
  Object.assign(baseline['calendar.txt'][1], {
    start_date: '20261101',
    end_date: '20261130',
    monday: '0',
    tuesday: '0',
    wednesday: '0',
    thursday: '0',
    friday: '0',
    saturday: '0',
    sunday: '1',
  });
  // November 30 is Monday. The last raw Sunday is past, but the bounds are still active.
  expect(
    assessExpiredServiceCleanup(baseline, candidate, '2026-11-30T08:00:00Z'),
  ).toBeNull();
});

test('unknown timing, new live calls and changed source metadata cannot be hidden by cleanup', () => {
  const unknown = fixture();
  unknown.baseline['stop_times.txt'][1].arrival_time = '';
  expect(
    assessExpiredServiceCleanup(
      unknown.baseline,
      unknown.candidate,
      unknown.now,
    ),
  ).toBeNull();
  const live = fixture();
  live.candidate['stop_times.txt'][0].departure_time = '26:00:00';
  expect(
    assessExpiredServiceCleanup(live.baseline, live.candidate, live.now),
  ).toBeNull();
  const metadata = fixture();
  metadata.candidate['routes.txt'][0].route_id = 'changed';
  expect(
    assessExpiredServiceCleanup(
      metadata.baseline,
      metadata.candidate,
      metadata.now,
    ),
  ).toBeNull();
});

test('equivalent inputs without expired service changes keep the existing qualification path', () => {
  const { baseline, now } = fixture();
  expect(
    assessExpiredServiceCleanup(baseline, structuredClone(baseline), now),
  ).toBeNull();
});
