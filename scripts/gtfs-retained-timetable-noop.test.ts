import { describe, expect, it } from 'vitest';
import { holidayFixture } from '../packages/fs/src/gtfs/__tests__/holidayFixture.js';
import { assessRetainedTimetableNoop } from './gtfs-retained-timetable-noop.mjs';

function fixture() {
  const { context, policy, calendar } = holidayFixture();
  const baseline = {
    context,
    holidayPolicy: policy,
    holidayCalendar: calendar,
    applicabilityPolicy: {
      serviceDateRange: {
        startDate: '2026-11-01',
        endDateExclusive: '2026-12-01',
      },
    },
  };
  const candidate = structuredClone(baseline);
  candidate.holidayPolicy.schemaVersion = 3;
  return { baseline, candidate, now: '2026-11-25T08:00:00Z' };
}

function cancel(
  candidate: ReturnType<typeof fixture>['candidate'],
  date: string,
) {
  candidate.context.tables['calendar_dates.txt'] = [
    { service_id: 'WD', date, exception_type: '2' },
  ];
}

describe('retaining the published timetable without replacing history', () => {
  it('accepts completed differences combined with unapproved future differences without mutating either source', () => {
    const { baseline, candidate, now } = fixture();
    cancel(candidate, '20261124');
    candidate.context.tables['calendar_dates.txt'].push({
      service_id: 'WD',
      date: '20261202',
      exception_type: '2',
    });
    const before = structuredClone({ baseline, candidate });
    expect(assessRetainedTimetableNoop(baseline, candidate, now)).toMatchObject(
      {
        unchangedFromServiceDate: '2026-11-25',
        expiredServiceDates: ['2026-11-24'],
        outsideApprovedServiceDates: ['2026-12-02'],
        serviceDateRange: {
          startDate: '2026-11-01',
          endDateExclusive: '2026-12-01',
        },
      },
    );
    expect({ baseline, candidate }).toEqual(before);
  });

  it.each([
    '20261125',
    '20261126',
    '20261130',
  ])('rejects a changed current or future approved date: %s', (date) => {
    const { baseline, candidate, now } = fixture();
    cancel(candidate, date);
    expect(assessRetainedTimetableNoop(baseline, candidate, now)).toBeNull();
  });

  it('checks both sides of an overnight change and waits strictly past the final arrival or departure', () => {
    const { baseline, candidate } = fixture();
    cancel(candidate, '20261124');
    const time = '2026-11-24T17:00:';
    // Source trips at 25:00 and 25:02 on Nov 24 remain active after Singapore midnight.
    expect(
      assessRetainedTimetableNoop(baseline, candidate, `${time}00Z`),
    ).toBeNull();
    expect(
      assessRetainedTimetableNoop(baseline, candidate, '2026-11-24T17:02:00Z'),
    ).toBeNull();
    expect(
      assessRetainedTimetableNoop(baseline, candidate, '2026-11-24T17:02:01Z')
        ?.expiredServiceDates,
    ).toEqual(['2026-11-24']);
    // A longer candidate overnight tail must also have finished.
    candidate.context.tables['calendar.txt'].push({
      ...candidate.context.tables['calendar.txt'][0],
      service_id: 'LATE',
      start_date: '20261124',
      end_date: '20261124',
    });
    const trip = candidate.context.tables['trips.txt'].find(
      (trip) => trip.trip_id === 'NSL_TEST_WD',
    );
    if (!trip) throw new Error('Missing unrelated trip');
    candidate.context.tables['trips.txt'].push({
      ...trip,
      trip_id: 'late',
      service_id: 'LATE',
    });
    candidate.context.tables['stop_times.txt'].push(
      ...candidate.context.tables['stop_times.txt']
        .filter((row) => row.trip_id === trip.trip_id)
        .map((row) => ({
          ...row,
          trip_id: 'late',
          arrival_time: '26:00:00',
          departure_time: '26:00:00',
        })),
    );
    expect(
      assessRetainedTimetableNoop(baseline, candidate, '2026-11-24T17:02:01Z'),
    ).toBeNull();
    expect(
      assessRetainedTimetableNoop(baseline, candidate, '2026-11-24T18:00:01Z')
        ?.expiredServiceDates,
    ).toEqual(['2026-11-24']);
  });

  it('uses effective holiday service rather than only raw calendar dates', () => {
    const { baseline, candidate } = fixture();
    baseline.applicabilityPolicy.serviceDateRange = {
      startDate: '2026-11-01',
      endDateExclusive: '2026-11-10',
    };
    candidate.applicabilityPolicy.serviceDateRange = {
      ...baseline.applicabilityPolicy.serviceDateRange,
    };
    for (const row of candidate.context.tables['stop_times.txt'].filter(
      (row) => row.trip_id === 'NEL_TEST_SU',
    ))
      row.departure_time = row.departure_time.replace(':00', ':01');
    // Monday Nov 9 is a substituted holiday; the previous raw Sunday has finished.
    expect(
      assessRetainedTimetableNoop(baseline, candidate, '2026-11-09T04:00:00Z'),
    ).toBeNull();
  });

  it.each([
    'arrival_time',
    'departure_time',
    'stop_id',
    'pickup_type',
    'timepoint',
  ])('requires exact remaining calls, including %s', (field) => {
    const { baseline, candidate, now } = fixture();
    const row = candidate.context.tables['stop_times.txt'][0];
    row[field] =
      field === 'stop_id'
        ? 'Q'
        : field === 'arrival_time'
          ? '24:59:59'
          : field === 'departure_time'
            ? '25:00:01'
            : '1';
    expect(assessRetainedTimetableNoop(baseline, candidate, now)).toBeNull();
  });

  it('preserves duplicate journey counts while allowing provider trip IDs to change', () => {
    const { baseline, candidate, now } = fixture();
    const trip = candidate.context.tables['trips.txt'][0];
    const old = trip.trip_id;
    trip.trip_id = 'renamed';
    for (const row of candidate.context.tables['stop_times.txt'].filter(
      (row) => row.trip_id === old,
    ))
      row.trip_id = trip.trip_id;
    expect(
      assessRetainedTimetableNoop(baseline, candidate, now),
    ).not.toBeNull();
    candidate.context.tables['trips.txt'].push({
      ...trip,
      trip_id: 'duplicate',
    });
    candidate.context.tables['stop_times.txt'].push(
      ...candidate.context.tables['stop_times.txt']
        .filter((row) => row.trip_id === trip.trip_id)
        .map((row) => ({ ...row, trip_id: 'duplicate' })),
    );
    expect(assessRetainedTimetableNoop(baseline, candidate, now)).toBeNull();
  });

  it('rejects unknown expiry timing, changed declarations, changed approval bounds and expired windows', () => {
    const { baseline, candidate, now } = fixture();
    cancel(candidate, '20261124');
    baseline.context.tables['stop_times.txt'][0].arrival_time = '';
    candidate.context.tables['stop_times.txt'][0].arrival_time = '';
    expect(assessRetainedTimetableNoop(baseline, candidate, now)).toBeNull();
    const metadata = fixture();
    metadata.candidate.context.tables['routes.txt'][0].route_type = '2';
    expect(
      assessRetainedTimetableNoop(metadata.baseline, metadata.candidate, now),
    ).toBeNull();
    const bounds = fixture();
    bounds.candidate.applicabilityPolicy.serviceDateRange.endDateExclusive =
      '2026-12-02';
    expect(
      assessRetainedTimetableNoop(bounds.baseline, bounds.candidate, now),
    ).toBeNull();
    expect(
      assessRetainedTimetableNoop(
        bounds.baseline,
        bounds.baseline,
        '2026-12-01T00:00:00Z',
      ),
    ).toBeNull();
  });
});
