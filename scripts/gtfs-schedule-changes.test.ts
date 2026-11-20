import { expect, test } from 'vitest';
import type { ScheduleTables } from '../packages/fs/src/gtfs/schedule.js';
import { serviceCoverage } from './build-gtfs-snapshot-review.mjs';
import {
  compareJourneySchedules,
  renderJourneyChanges,
} from './gtfs-schedule-changes.mjs';

function fixture(): ScheduleTables {
  return {
    'routes.txt': [
      {
        route_id: 'R',
        route_long_name: 'Test Line',
        route_type: '1',
        agency_id: 'A',
      },
    ],
    'stops.txt': [
      { stop_id: 'A', stop_name: 'Alpha', platform_code: 'A' },
      { stop_id: 'B', stop_name: 'Beta', platform_code: 'B' },
    ],
    'trips.txt': [
      {
        trip_id: 'T',
        route_id: 'R',
        service_id: 'C',
        direction_id: '0',
        trip_headsign: 'Beta',
      },
    ],
    'stop_times.txt': [
      {
        trip_id: 'T',
        stop_id: 'A',
        stop_sequence: '1',
        arrival_time: '24:10:00',
        departure_time: '24:10:00',
      },
      {
        trip_id: 'T',
        stop_id: 'B',
        stop_sequence: '2',
        arrival_time: '24:20:00',
        departure_time: '24:20:00',
      },
    ],
    'calendar.txt': [
      {
        service_id: 'C',
        monday: '1',
        tuesday: '1',
        wednesday: '1',
        thursday: '1',
        friday: '1',
        saturday: '1',
        sunday: '1',
        start_date: '20261119',
        end_date: '20261121',
      },
    ],
    'calendar_dates.txt': [],
  };
}
function run(before: ScheduleTables, after: ScheduleTables) {
  return compareJourneySchedules(
    before,
    after,
    serviceCoverage(before),
    serviceCoverage(after),
  );
}
function addTrip(data: ScheduleTables, id: string) {
  data['trips.txt'].push({ ...data['trips.txt'][0], trip_id: id });
  data['stop_times.txt'].push(
    ...data['stop_times.txt']
      .filter((row) => row.trip_id === 'T')
      .map((row) => ({ ...row, trip_id: id })),
  );
}

test('ignores trip/calendar/block/route ID churn, row ordering, padded times and sequence formatting', () => {
  const before = fixture();
  const after = fixture();
  after['trips.txt'][0] = {
    ...after['trips.txt'][0],
    trip_id: 'new',
    service_id: 'new',
    route_id: 'new',
    block_id: 'changed',
  };
  after['routes.txt'][0].route_id = 'new';
  after['calendar.txt'][0].service_id = 'new';
  for (const row of after['stop_times.txt']) {
    row.trip_id = 'new';
    row.stop_sequence = `00${row.stop_sequence}`;
    row.arrival_time = `0${row.arrival_time}`;
    row.departure_time = `0${row.departure_time}`;
    row.pickup_type = '0';
    row.drop_off_type = '0';
    row.timepoint = '1';
  }
  after['stop_times.txt'].reverse();
  expect(run(before, after).changes).toEqual([]);
  expect(renderJourneyChanges(run(before, after), String).join('\n')).toContain(
    'daily journey schedules are unchanged',
  );
});

test('compares a multiset: a duplicate journey increases the daily count despite new provider IDs', () => {
  const before = fixture();
  const after = fixture();
  addTrip(after, 'duplicate');
  const report = run(before, after);
  expect(report.changes).toHaveLength(1);
  expect(report.changes[0]).toMatchObject({
    dates: ['2026-11-19', '2026-11-20', '2026-11-21'],
    beforeJourneyCount: 1,
    afterJourneyCount: 2,
    unchangedJourneyCount: 1,
    addedJourneySchedules: 1,
  });
  expect(report.changes[0].patterns[0].exactExamples).toEqual({
    callTimes: [],
    details: [],
  });
});

test('changed-schedule summaries and their bounded examples are stable across CSV row order', () => {
  const before = fixture();
  const after = fixture();
  addTrip(before, 'second');
  addTrip(after, 'second');
  for (const row of before['stop_times.txt'].filter(
    (row) => row.trip_id === 'second',
  )) {
    row.arrival_time = row.arrival_time.replace('24:', '25:');
    row.departure_time = row.departure_time.replace('24:', '25:');
  }
  for (const row of after['stop_times.txt']) {
    const hour = row.trip_id === 'second' ? '25:' : '24:';
    row.arrival_time = row.arrival_time
      .replace('24:', hour)
      .replace(':20:', ':21:');
    row.departure_time = row.departure_time
      .replace('24:', hour)
      .replace(':20:', ':21:');
  }
  const report = run(before, after);
  before['trips.txt'].reverse();
  before['stop_times.txt'].reverse();
  after['trips.txt'].reverse();
  after['stop_times.txt'].reverse();
  expect(run(before, after)).toEqual(report);
});

test('groups equal date changes and applies exception overrides without moving overnight calls to another service date', () => {
  const before = fixture();
  const after = fixture();
  after['calendar_dates.txt'] = [
    { service_id: 'C', date: '20261120', exception_type: '2' },
    { service_id: 'special', date: '20261120', exception_type: '1' },
  ];
  after['trips.txt'].push({
    ...after['trips.txt'][0],
    trip_id: 'special',
    service_id: 'special',
  });
  after['stop_times.txt'].push(
    ...after['stop_times.txt'].map((row) => ({
      ...row,
      trip_id: 'special',
      arrival_time: row.arrival_time.replace('24:', '25:'),
      departure_time: row.departure_time.replace('24:', '25:'),
    })),
  );
  const report = run(before, after);
  expect(report.changes).toHaveLength(1);
  expect(report.changes[0].dates).toEqual(['2026-11-20']);
  expect(report.unchangedDates[0].dates).toEqual(['2026-11-19', '2026-11-21']);
  expect(report.changes[0].patterns[0]).toMatchObject({
    removedDepartureExamples: ['24:10:00'],
    addedDepartureExamples: ['25:10:00'],
  });
  expect(report.changes[0].highlights[0]).toMatchObject({
    before: '24:10:00',
    after: '25:10:00',
    differenceSeconds: 3600,
  });
});

test('preserves platforms, repeated stop occurrences, and boarding rules as distinct stopping patterns', () => {
  const before = fixture();
  const after = fixture();
  after['stops.txt'].push({
    stop_id: 'A2',
    stop_name: 'Alpha',
    platform_code: 'B',
  });
  after['stop_times.txt'][0].stop_id = 'A2';
  after['stop_times.txt'][0].pickup_type = '1';
  after['stop_times.txt'].push({
    ...after['stop_times.txt'][1],
    stop_id: 'A2',
    stop_sequence: '3',
    arrival_time: '24:30:00',
    departure_time: '24:30:00',
  });
  const report = run(before, after);
  expect(
    report.changes[0].patterns
      .map((pattern: { status: string }) => pattern.status)
      .sort(),
  ).toEqual(['new-pattern', 'removed-pattern']);
  const added = report.changes[0].patterns.find(
    (pattern: { status: string }) => pattern.status === 'new-pattern',
  );
  expect(
    report.patternDefinitions[added.patternSha256].map(
      (stop: { id: string }) => stop.id,
    ),
  ).toEqual(['A2', 'B', 'A2']);
  expect(renderJourneyChanges(report, String).join('\n')).toContain(
    'Alpha (platform B)',
  );
});

test('distinguishes changes within a journey from unchanged origin departures and from display-only changes', () => {
  const before = fixture();
  const after = fixture();
  after['stop_times.txt'][1].arrival_time = '24:21:00';
  after['stop_times.txt'][1].departure_time = '24:21:00';
  expect(run(before, after).changes[0].patterns[0]).toMatchObject({
    timingChanged: true,
    removedDepartureCount: 0,
    addedDepartureCount: 0,
    exactExamples: {
      callTimes: [
        {
          originTime: '24:10:00',
          occurrence: 2,
          before: ['24:20:00', '24:20:00'],
          after: ['24:21:00', '24:21:00'],
        },
      ],
    },
  });
  const labels = fixture();
  labels['trips.txt'][0].trip_headsign = 'New headsign';
  expect(run(before, labels).changes[0].patterns[0]).toMatchObject({
    timingChanged: false,
    exactExamples: {
      details: [
        { field: 'Destination display', before: 'Beta', after: 'New headsign' },
      ],
    },
  });
  expect(
    renderJourneyChanges(run(before, labels), String).join('\n'),
  ).toContain('Timings are retained');
});

test('surfaces changed source platform labels even when stop IDs are retained', () => {
  const before = fixture();
  const after = fixture();
  after['stops.txt'][0].platform_code = 'B';
  const report = run(before, after);
  const patterns = report.changes[0].patterns;
  expect(
    patterns.map((pattern: { status: string }) => pattern.status).sort(),
  ).toEqual(['new-pattern', 'removed-pattern']);
  expect(
    Object.values(report.patternDefinitions)
      .map((stops) => (stops as { platform: string }[])[0].platform)
      .sort(),
  ).toEqual(['A', 'B']);
});

test('does not turn missing calendars, frequency schedules, or unavailable evidence into unchanged claims', () => {
  const before = fixture();
  const after = fixture();
  after['frequencies.txt'] = [
    {
      trip_id: 'T',
      start_time: '07:00:00',
      end_time: '08:00:00',
      headway_secs: '300',
    },
  ];
  expect(() => run(before, after)).toThrow('Frequency-based');
  const text = renderJourneyChanges(
    { status: 'unavailable', reason: 'Missing baseline' },
    String,
  ).join('\n');
  expect(text).toContain('Missing baseline');
  expect(text).not.toContain('are unchanged');
});

test('renders full-year weekly schedules with their exact excluded dates', () => {
  const before = fixture();
  const after = fixture();
  for (const tables of [before, after])
    Object.assign(tables['calendar.txt'][0], {
      start_date: '20260101',
      end_date: '20261231',
    });
  const saturdays = serviceCoverage(before).dates.filter(
    (date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 6,
  );
  after['calendar_dates.txt'] = saturdays
    .filter((date) => date !== '2026-11-14')
    .map((date) => ({
      service_id: 'C',
      date: date.replaceAll('-', ''),
      exception_type: '2',
    }));
  const report = run(before, after);
  expect(renderJourneyChanges(report, String).join('\n')).toContain(
    'Saturdays in 2026, except 14 Nov 2026',
  );
});
