import { isDeepStrictEqual } from 'node:util';
import {
  hashBytes,
  singaporeCaptureDate,
} from '../packages/fs/dist/gtfs/capture.js';
import { compareStopSequences } from '../packages/fs/dist/gtfs/order.js';
import { gtfsTimeSeconds } from '../packages/fs/dist/gtfs/schedule.js';
import { resolveScheduledHolidayDates } from '../packages/fs/dist/gtfs/scheduledHolidayPolicy.js';

const record = (row, excluded = []) =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !excluded.includes(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/** Compare exact effective journeys, including multiplicity, access and unknown metadata.
 * Only trip/calendar identifiers may differ. No replacement artifact is generated.
 */
export function assessRetainedTimetableNoop(baselineInputs, inputs, now) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) return null;
  const range = baselineInputs.applicabilityPolicy.serviceDateRange;
  if (!isDeepStrictEqual(range, inputs.applicabilityPolicy.serviceDateRange))
    return null;
  const today = singaporeCaptureDate(now);
  if (today < range.startDate || today >= range.endDateExclusive) return null;
  const baselineTables = baselineInputs.context.tables;
  const tables = inputs.context.tables;
  // This proof cannot disregard changed source declarations or unknown tables.
  for (const name of new Set([
    ...Object.keys(baselineTables),
    ...Object.keys(tables),
  ])) {
    if (
      [
        'trips.txt',
        'stop_times.txt',
        'calendar.txt',
        'calendar_dates.txt',
      ].includes(name)
    )
      continue;
    const normalize = (rows) =>
      rows?.map((row) => JSON.stringify(record(row))).sort();
    if (
      !isDeepStrictEqual(
        normalize(baselineTables[name]),
        normalize(tables[name]),
      )
    )
      return null;
  }
  const signatures = new Map();
  function dailySchedules(source) {
    const sourceTables = source.context.tables;
    const calls = new Map();
    for (const row of sourceTables['stop_times.txt']) {
      const rows = calls.get(row.trip_id) ?? [];
      rows.push(row);
      calls.set(row.trip_id, rows);
    }
    for (const rows of calls.values())
      rows.sort((a, b) =>
        compareStopSequences(a.stop_sequence, b.stop_sequence),
      );
    const trips = new Map(
      sourceTables['trips.txt'].map((trip) => [trip.trip_id, trip]),
    );
    const resolved = resolveScheduledHolidayDates(
      source.context,
      source.holidayPolicy,
      source.holidayCalendar,
    );
    const days = new Map();
    for (const pattern of resolved.patterns) {
      const journeys = [];
      let latestSeconds = 0;
      let knownTiming = true;
      for (const id of pattern.tripIds) {
        const rows = calls.get(id);
        if (!rows?.length || !trips.has(id))
          throw new Error('Incomplete journey in retained timetable proof');
        const digest = hashBytes(
          Buffer.from(
            JSON.stringify([
              record(trips.get(id), ['trip_id', 'service_id']),
              rows.map((row) => record(row, ['trip_id'])),
            ]),
          ),
        );
        if (!signatures.has(digest)) signatures.set(digest, signatures.size);
        journeys.push(signatures.get(digest));
        for (const row of rows)
          for (const field of ['arrival_time', 'departure_time']) {
            const seconds = gtfsTimeSeconds(row[field] ?? '');
            if (seconds === null || !Number.isFinite(seconds))
              knownTiming = false;
            else latestSeconds = Math.max(latestSeconds, seconds);
          }
      }
      for (const date of pattern.serviceDates) {
        const day = days.get(date) ?? {
          journeys: [],
          latestSeconds: 0,
          knownTiming: true,
        };
        day.journeys.push(...journeys);
        day.latestSeconds = Math.max(day.latestSeconds, latestSeconds);
        day.knownTiming &&= knownTiming;
        days.set(date, day);
      }
    }
    for (const day of days.values()) day.journeys.sort((a, b) => a - b);
    return days;
  }
  const before = dailySchedules(baselineInputs);
  const after = dailySchedules(inputs);
  const expiredServiceDates = [];
  const outsideApprovedServiceDates = [];
  const dates = [...new Set([...before.keys(), ...after.keys()])].sort();
  const finished = (date, day) =>
    !day ||
    (day.knownTiming &&
      Date.parse(`${date}T00:00:00+08:00`) + day.latestSeconds * 1000 <
        instant);
  for (const date of dates) {
    const old = before.get(date);
    const current = after.get(date);
    if (isDeepStrictEqual(old?.journeys ?? [], current?.journeys ?? []))
      continue;
    if (date < range.startDate || date >= range.endDateExclusive) {
      outsideApprovedServiceDates.push(date);
    } else if (date < today && finished(date, old) && finished(date, current)) {
      expiredServiceDates.push(date);
    } else return null;
  }
  return {
    schemaVersion: 1,
    documentKind: 'gtfs-retained-timetable-no-op-proof',
    checkedAt: now,
    serviceDateRange: { ...range },
    unchangedFromServiceDate: today,
    expiredServiceDates,
    outsideApprovedServiceDates,
  };
}
