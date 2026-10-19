import { describe, expect, it } from 'vitest';
import { ScheduledAssignedTimetableSchema } from './ScheduledAssignedTimetable.js';

function bundle() {
  const pattern = {
    lineId: 'L',
    serviceId: 'SVC',
    revisionId: 'r1',
    destinationStationId: 'S',
    stops: [
      { stationId: 'S', platformIds: ['A'] },
      { stationId: 'S', platformIds: ['B'] },
    ],
  };
  return {
    schemaVersion: 1,
    timetable: {
      schemaVersion: 1,
      timeZone: 'Asia/Singapore',
      calendars: [
        {
          providerCalendarId: 'C',
          weekly: null,
          exceptions: [{ date: '2026-01-01', available: true }],
        },
      ],
      trips: ['T', 'unassigned'].map((providerTripId) => ({
        providerTripId,
        providerRouteId: 'R',
        providerCalendarId: 'C',
        stopTimes: ['09007199254740992', '9007199254740993'].map(
          (stopSequence) => ({
            providerTripId,
            providerStopId: 'P',
            stopSequence,
            arrivalSeconds: 90000,
            departureSeconds: 90000,
            pickupType: 1,
            dropOffType: 3,
            timepoint: 0,
          }),
        ),
      })),
    },
    patterns: [
      { id: 'p1', pattern },
      { id: 'p2', pattern: { ...pattern, revisionId: 'r2' } },
    ],
    assignments: [
      {
        providerTripId: 'T',
        patternId: 'p1',
        dateRanges: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
      },
      {
        providerTripId: 'T',
        patternId: 'p2',
        dateRanges: [{ startDate: '2026-01-03', endDate: '2026-01-04' }],
      },
    ],
  };
}

describe('ScheduledAssignedTimetableSchema', () => {
  it('retains source timing and calendars with shared patterns and disjoint date ranges, allowing unassigned trips', () => {
    const value = bundle();
    expect(
      JSON.parse(JSON.stringify(ScheduledAssignedTimetableSchema.parse(value))),
    ).toEqual(value);
    expect(
      ScheduledAssignedTimetableSchema.parse({
        ...value,
        patterns: [],
        assignments: [],
      }).timetable,
    ).toEqual(value.timetable);
  });

  it('rejects ambiguous ranges across patterns and within a single allocation', () => {
    for (const ranges of [
      [{ startDate: '2026-01-02', endDate: '2026-01-03' }],
      [{ startDate: '2026-01-04', endDate: '2026-01-03' }],
      [
        { startDate: '2026-01-03', endDate: '2026-01-05' },
        { startDate: '2026-01-04', endDate: '2026-01-04' },
      ],
      [{ startDate: '2026-02-30', endDate: '2026-03-01' }],
    ]) {
      const value = bundle();
      value.assignments[1].dateRanges = ranges;
      expect(ScheduledAssignedTimetableSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });

  it('rejects duplicate or dangling identities, occurrence truncation, source errors and approval metadata', () => {
    const changes: ((value: ReturnType<typeof bundle>) => void)[] = [
      (value) => {
        value.patterns[1].id = 'p1';
      },
      (value) => {
        value.assignments[0].providerTripId = 'missing';
      },
      (value) => {
        value.assignments[0].patternId = 'missing';
      },
      (value) => {
        value.patterns[0].pattern.stops.pop();
      },
      (value) => {
        value.timetable.trips[0].providerCalendarId = 'missing';
      },
      (value) => {
        Object.assign(value, { generationEligible: true });
      },
    ];
    for (const change of changes) {
      const value = bundle();
      change(value);
      expect(ScheduledAssignedTimetableSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });
});
