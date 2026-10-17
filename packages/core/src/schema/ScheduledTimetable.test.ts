import { describe, expect, it } from 'vitest';
import { ScheduledTimetableSchema } from './ScheduledTimetable.js';

function timetable() {
  return {
    schemaVersion: 1,
    timeZone: 'Asia/Singapore',
    calendars: [
      {
        providerCalendarId: 'C',
        weekly: null,
        exceptions: [{ date: '2026-01-01', available: true }],
      },
    ],
    trips: ['T', 't'].map((providerTripId) => ({
      providerTripId,
      providerRouteId: 'R',
      providerCalendarId: 'C',
      stopTimes: ['09007199254740992', '9007199254740993'].map(
        (stopSequence) => ({
          providerTripId,
          providerStopId: 'REPEATED',
          stopSequence,
          arrivalSeconds: 90000,
          departureSeconds: 90000,
          pickupType: 1,
          dropOffType: 3,
          timepoint: 0,
        }),
      ),
    })),
  };
}

describe('ScheduledTimetableSchema', () => {
  it('round-trips shared calendars and distinct source occurrences without expanding service dates', () => {
    const value = timetable();
    expect(
      JSON.parse(JSON.stringify(ScheduledTimetableSchema.parse(value))),
    ).toEqual(value);
  });

  it('reports duplicate identities and dangling calendar references at their records', () => {
    const value = timetable();
    value.calendars.push({ ...value.calendars[0] });
    value.trips[1].providerTripId = 'T';
    for (const stop of value.trips[1].stopTimes) {
      stop.providerTripId = 'T';
    }
    value.trips[1].providerCalendarId = 'MISSING';
    const result = ScheduledTimetableSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['calendars', 1, 'providerCalendarId'],
        ['trips', 1, 'providerTripId'],
        ['trips', 1, 'providerCalendarId'],
      ]);
    }
  });

  it('enforces calendar and complete-trip validation inside the bundle', () => {
    const value = timetable();
    value.calendars[0].exceptions[0].date = '2026-02-30';
    value.trips[0].stopTimes[1].stopSequence = '9007199254740992';
    const result = ScheduledTimetableSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'calendars',
        0,
        'exceptions',
        0,
        'date',
      ]);
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual([
        'trips',
        0,
        'stopTimes',
        1,
        'stopSequence',
      ]);
    }
  });

  it('rejects empty bundles, unsupported formats and approval metadata', () => {
    const value = timetable();
    for (const change of [
      { calendars: [] },
      { trips: [] },
      { schemaVersion: 2 },
      { timeZone: 'UTC' },
      { generationEligible: true },
    ]) {
      expect(
        ScheduledTimetableSchema.safeParse({ ...value, ...change }).success,
      ).toBe(false);
    }
  });
});
