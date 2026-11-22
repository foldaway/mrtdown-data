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
    report.patternDefinitions[added.definitionSha256].map(
      (stop: { id: string }) => stop.id,
    ),
  ).toEqual(['A2', 'B', 'A2']);
  expect(renderJourneyChanges(report, String).join('\n')).toContain(
    'Alpha (platform B)',
  );
});

test.each([
  'continuous_pickup',
  'continuous_drop_off',
])('compares effective %s defaults and overrides rather than their source placement', (field) => {
  const before = fixture();
  const after = fixture();
  after['routes.txt'][0][field] = '1';
  expect(run(before, after).changes).toEqual([]);

  before['routes.txt'][0][field] = '0';
  after['routes.txt'][0][field] = '0';
  for (const call of after['stop_times.txt']) call[field] = '0';
  expect(run(before, after).changes).toEqual([]);

  // An explicit override wins even when the route default changes.
  for (const call of before['stop_times.txt']) call[field] = '2';
  for (const call of after['stop_times.txt']) call[field] = '2';
  after['routes.txt'][0][field] = '3';
  expect(run(before, after).changes).toEqual([]);

  after['stop_times.txt'][0][field] = '1';
  expect(run(before, after).changes[0].patterns).toHaveLength(2);
});

test.each([
  { index: 0, field: 'arrival_time', timepoint: '1' },
  { index: 0, field: 'departure_time', timepoint: '0' },
  { index: 1, field: 'arrival_time', timepoint: '0' },
  { index: 1, field: 'departure_time', timepoint: '1' },
])('rejects missing required $field at call $index (timepoint $timepoint)', ({
  index,
  field,
  timepoint,
}) => {
  const after = fixture();
  Object.assign(after['stop_times.txt'][index], { [field]: '', timepoint });
  expect(() => run(fixture(), after)).toThrow('Missing required');
  expect(() => run(after, fixture())).toThrow('Missing required');
});

test('retains valid blank intermediate times and rejects blanks at exact intermediate timepoints', () => {
  const before = fixture();
  before['stop_times.txt'][1].stop_sequence = '3';
  before['stop_times.txt'].splice(1, 0, {
    trip_id: 'T',
    stop_id: 'A',
    stop_sequence: '2',
    timepoint: '0',
    arrival_time: '',
    departure_time: '',
  });
  const after = structuredClone(before);
  after['stop_times.txt'][2].arrival_time = '24:21:00';
  expect(
    run(before, after).changes[0].patterns[0].exactExamples.callTimes,
  ).toMatchObject([{ occurrence: 3, before: ['24:20:00', '24:20:00'] }]);
  // A final departure can be absent when the final call is not an exact timepoint.
  after['stop_times.txt'][2].timepoint = '0';
  after['stop_times.txt'][2].departure_time = '';
  expect(() => run(before, after)).not.toThrow();
  for (const timepoint of ['1', '']) {
    after['stop_times.txt'][1].timepoint = timepoint;
    expect(() => run(before, after)).toThrow('Missing required');
  }
});

test('keeps baseline stop names on removed shared patterns without treating renames as new service', () => {
  const before = fixture();
  before['routes.txt'][0].route_long_name = 'A Line';
  before['routes.txt'].push({
    ...before['routes.txt'][0],
    route_id: 'R2',
    route_long_name: 'B Line',
  });
  addTrip(before, 'second');
  before['trips.txt'][1].route_id = 'R2';
  const after = structuredClone(before);
  after['stops.txt'][0].stop_name = 'New Alpha';
  expect(run(before, after).changes).toEqual([]);
  after['trips.txt'] = after['trips.txt'].filter(
    (trip) => trip.trip_id !== 'T',
  );
  after['stop_times.txt'] = after['stop_times.txt']
    .filter((call) => call.trip_id !== 'T')
    .map((call) => ({
      ...call,
      arrival_time: call.arrival_time.replace('24:', '25:'),
      departure_time: call.departure_time.replace('24:', '25:'),
    }));
  const report = run(before, after);
  const removed = report.changes.find((change) => change.line === 'A Line')
    .patterns[0];
  const retained = report.changes.find((change) => change.line === 'B Line')
    .patterns[0];
  expect(removed.patternSha256).toBe(retained.patternSha256);
  expect(removed.definitionSha256).not.toBe(retained.definitionSha256);
  expect(report.patternDefinitions[removed.definitionSha256][0].name).toBe(
    'Alpha',
  );
  expect(report.patternDefinitions[retained.definitionSha256][0].name).toBe(
    'New Alpha',
  );
  const text = renderJourneyChanges(report, String).join('\n');
  expect(text).toContain('no longer listed: Alpha (platform A)');
  expect(text).toContain('For New Alpha (platform A)');
  before['trips.txt'].reverse();
  after['trips.txt'].reverse();
  expect(run(before, after)).toEqual(report);
});

test('explains boarding restrictions at each occurrence, including calls omitted from the short path', () => {
  const before = fixture();
  for (let i = 3; i <= 6; i++) {
    before['stop_times.txt'].push({
      ...before['stop_times.txt'][1],
      stop_sequence: String(i),
    });
  }
  const after = structuredClone(before);
  after['stop_times.txt'][0].pickup_type = '1';
  after['stop_times.txt'][4].pickup_type = '2';
  after['stop_times.txt'][4].continuous_drop_off = '0';
  after['stop_times.txt'][5].drop_off_type = '3';
  const report = run(before, after);
  const text = renderJourneyChanges(report, String).join('\n');
  expect(text).toContain('Alpha (platform A) (call 1): no boarding');
  expect(text).toContain(
    'Beta (platform B) (call 5): phone the agency to arrange boarding; continuous alighting permitted until the next call',
  );
  expect(text).toContain(
    'Beta (platform B) (call 6): coordinate with the driver to alight',
  );
  expect(text).toContain('Stopping pattern no longer listed:');
  expect(text).toContain('Newly listed stopping pattern:');
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

test('ignores terminal continuous rules but preserves rules on actual segments', () => {
  const before = fixture();
  before['routes.txt'][0].continuous_pickup = '0';
  before['routes.txt'][0].continuous_drop_off = '0';
  const after = structuredClone(before);
  after['stop_times.txt'][1].continuous_pickup = '1';
  after['stop_times.txt'][1].continuous_drop_off = '1';
  expect(run(before, after).changes).toEqual([]);
  after['stop_times.txt'][0].continuous_pickup = '1';
  const changed = run(before, after);
  expect(
    changed.changes[0].patterns.map((pattern) => pattern.status).sort(),
  ).toEqual(['new-pattern', 'removed-pattern']);
  expect(
    Object.values(changed.patternDefinitions).every(
      (stops) =>
        stops.at(-1).continuousPickup === '1' &&
        stops.at(-1).continuousDropOff === '1',
    ),
  ).toBe(true);
});

test('preserves identities and unchanged lines when distinct routes share a display name', () => {
  const before = fixture();
  before['routes.txt'][0].route_short_name = 'A';
  before['routes.txt'].push({
    ...before['routes.txt'][0],
    route_id: 'OTHER',
    route_short_name: 'B',
  });
  addTrip(before, 'T2');
  before['trips.txt'][1].route_id = 'OTHER';
  const after = structuredClone(before);
  after['stop_times.txt'][1].arrival_time = '24:19:00';
  const report = run(before, after);
  expect(report.changes[0].line).toBe('Test Line (A)');
  expect(JSON.parse(report.changes[0].lineKey)).toContain('A');
  expect(report.unchangedLines).toEqual(['Test Line (B)']);
  expect(Object.keys(report.lineLabels)).toHaveLength(2);
  const text = renderJourneyChanges(report, String).join('\n');
  expect(text).toContain('Test Line (A)');
  expect(text).toContain('Test Line (B) are unchanged');
});

test('counts arrival-time edits as journey detail changes within retained patterns', () => {
  const before = fixture();
  const after = fixture();
  after['stop_times.txt'][1].arrival_time = '24:19:00';
  const text = renderJourneyChanges(run(before, after), String).join('\n');
  expect(text).toContain(
    'Stopping patterns: 0 added, 0 removed, 1 retained with changed journey details',
  );
  expect(text).not.toContain('stopping patterns differ');
});

test('limits accessibility claims to trip fields and directs stop-level changes to table evidence', () => {
  const before = fixture();
  const after = fixture();
  after['stops.txt'][0].wheelchair_boarding = '2';
  const report = run(before, after);
  expect(report.changes).toEqual([]);
  expect(report.basis).toContain(
    'trip-level wheelchair_accessible/bikes_allowed',
  );
  expect(renderJourneyChanges(report, String).join('\n')).toContain(
    'Stop-level accessibility changes appear in the table comparison',
  );
});

test('rejects trips without stop times before building empty pattern definitions', () => {
  const after = fixture();
  after['stop_times.txt'] = [];
  expect(() => run(fixture(), after)).toThrow('Trip T has no stop times');
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

test('inspects flexible windows once per source row regardless of trip count', () => {
  const data = fixture();
  for (let i = 1; i < 100; i++) addTrip(data, `T${i}`);
  let inspections = 0;
  for (const row of data['stop_times.txt']) {
    Object.defineProperty(row, 'start_pickup_drop_off_window', {
      get() {
        inspections++;
        return '';
      },
    });
  }
  expect(run(data, data).changes).toEqual([]);
  expect(inspections).toBeLessThanOrEqual(data['stop_times.txt'].length * 2);

  const unsupported = fixture();
  unsupported['stop_times.txt'][0].end_pickup_drop_off_window = '25:00:00';
  expect(() => run(fixture(), unsupported)).toThrow(
    'Flexible pickup/drop-off windows',
  );
});

test.each([
  {
    dates: [
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ],
    expected:
      '6 service dates from 5 Jan 2026 to 16 Nov 2026 (exact dates in JSON)',
  },
  {
    dates: [
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
    ],
    expected: 'Mondays within 5 Jan 2026–23 Feb 2026, except 26 Jan 2026',
  },
])('accounts for source-calendar gaps before describing weekly changes: $expected', ({
  dates,
  expected,
}) => {
  const before = fixture();
  const after = fixture();
  for (const data of [before, after]) {
    delete data['calendar.txt'];
    data['calendar_dates.txt'] = dates.map((date) => ({
      service_id: 'C',
      date: date.replaceAll('-', ''),
      exception_type: '1',
    }));
  }
  after['stop_times.txt'][0].arrival_time = '24:11:00';
  after['stop_times.txt'][0].departure_time = '24:11:00';
  const report = run(before, after);
  expect(report.changes[0].dates).toEqual(dates);
  expect(renderJourneyChanges(report, String).join('\n')).toContain(expected);
});
