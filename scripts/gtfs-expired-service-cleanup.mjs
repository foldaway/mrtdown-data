import { isDeepStrictEqual } from 'node:util';
import { singaporeCaptureDate } from '../packages/fs/dist/gtfs/capture.js';
import { compareStopSequences } from '../packages/fs/dist/gtfs/order.js';
import { activeServiceDates } from '../packages/fs/dist/gtfs/reconciliationEvidence.js';
import { gtfsTimeSeconds } from '../packages/fs/dist/gtfs/schedule.js';

const encode = (row) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(row).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
const date = (value) =>
  `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;

/** Prove a no-op on already structurally verified sources; never approve a replacement release. */
export function assessExpiredServiceCleanup(baseline, candidate, now) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) return null;
  const today = singaporeCaptureDate(now);
  for (const name of new Set([
    ...Object.keys(baseline),
    ...Object.keys(candidate),
  ])) {
    if (
      [
        'calendar.txt',
        'calendar_dates.txt',
        'trips.txt',
        'stop_times.txt',
      ].includes(name)
    )
      continue;
    if (
      !isDeepStrictEqual(
        (baseline[name] ?? []).map(encode).sort(),
        (candidate[name] ?? []).map(encode).sort(),
      )
    )
      return null;
  }
  function model(tables) {
    const calendars = new Map();
    const calls = new Map();
    for (const row of tables['stop_times.txt']) {
      const list = calls.get(row.trip_id) ?? [];
      list.push(row);
      calls.set(row.trip_id, list);
    }
    for (const list of calls.values())
      list.sort((a, b) =>
        compareStopSequences(a.stop_sequence, b.stop_sequence),
      );
    const trips = new Map(
      tables['trips.txt'].map((trip) => [trip.trip_id, trip]),
    );
    for (const id of new Set(
      tables['trips.txt'].map((trip) => trip.service_id),
    )) {
      const weekly = tables['calendar.txt']?.find(
        (row) => row.service_id === id,
      );
      const exceptions = new Map(
        (tables['calendar_dates.txt'] ?? [])
          .filter((row) => row.service_id === id)
          .map((row) => [date(row.date), row]),
      );
      // Include declared bounds even on non-running weekdays: holiday substitution
      // can still use a Sunday template on a Monday within those bounds.
      const bounds = [
        ...exceptions.keys(),
        ...(weekly ? [date(weekly.end_date)] : []),
      ].sort();
      calendars.set(id, {
        weekly,
        exceptions,
        lastBound: bounds.at(-1),
        dates: activeServiceDates(tables, id),
      });
    }
    return { trips, calls, calendars };
  }
  const before = model(baseline),
    after = model(candidate);
  const affected = new Set();
  let removedTrips = 0,
    addedTrips = 0,
    changedTrips = 0;
  function completed(serviceDate, rows) {
    if (!serviceDate || serviceDate >= today || !rows?.length) return false;
    let last = 0;
    for (const row of rows)
      for (const field of ['arrival_time', 'departure_time']) {
        const seconds = gtfsTimeSeconds(row[field] ?? '');
        if (seconds === null || !Number.isFinite(seconds)) return false;
        last = Math.max(last, seconds);
      }
    const end = Date.parse(`${serviceDate}T00:00:00+08:00`) + last * 1000;
    return Number.isFinite(end) && end < instant;
  }
  function expired(model, trip) {
    if (!trip) return true;
    const calendar = model.calendars.get(trip.service_id);
    if (
      !calendar ||
      !completed(calendar.lastBound, model.calls.get(trip.trip_id))
    )
      return false;
    for (const serviceDate of calendar.dates) affected.add(serviceDate);
    return true;
  }
  const calendarChanges = new Map();
  for (const id of new Set([...before.trips.keys(), ...after.trips.keys()])) {
    const old = before.trips.get(id),
      current = after.trips.get(id);
    if (
      !old ||
      !current ||
      !isDeepStrictEqual(old, current) ||
      !isDeepStrictEqual(before.calls.get(id), after.calls.get(id))
    ) {
      if (!expired(before, old) || !expired(after, current)) return null;
      if (!current) removedTrips++;
      else if (!old) addedTrips++;
      else changedTrips++;
      continue;
    }
    const a = before.calendars.get(old.service_id),
      b = after.calendars.get(current.service_id);
    if (!isDeepStrictEqual(a.weekly, b.weekly)) {
      if (!expired(before, old) || !expired(after, current)) return null;
      continue;
    }
    if (!calendarChanges.has(old.service_id)) {
      calendarChanges.set(
        old.service_id,
        [...new Set([...a.exceptions.keys(), ...b.exceptions.keys()])].filter(
          (day) =>
            !isDeepStrictEqual(a.exceptions.get(day), b.exceptions.get(day)),
        ),
      );
    }
    for (const day of calendarChanges.get(old.service_id)) {
      if (!completed(day, before.calls.get(id))) return null;
      affected.add(day);
    }
  }
  if (!affected.size) return null;
  return {
    serviceDates: [...affected].sort(),
    removedTrips,
    addedTrips,
    changedTrips,
  };
}
