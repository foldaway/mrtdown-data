import { isDeepStrictEqual } from 'node:util';
import z from 'zod';
import {
  auditSchedule,
  gtfsTimeSeconds,
} from '../packages/fs/dist/gtfs/schedule.js';

export const automaticPublicationPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.enum(['timing-only-v1', 'canonical-schedule-v2']),
    scope: z.enum(['timing-only', 'canonical-schedule']),
    maximumCaptureAgeHours: z.number().positive().max(72),
    maximumTripCountChangeFraction: z.number().nonnegative().max(0.1),
    maximumDepartureShiftSeconds: z.number().nonnegative().max(1800),
    sameProviderVersion: z.literal('allow-checked-successor'),
    captureConditions: z.string().trim().min(1),
  })
  .strict()
  .refine(
    (policy) =>
      (policy.revision === 'timing-only-v1') ===
      (policy.scope === 'timing-only'),
    'Policy revision and scope disagree',
  );

const encode = (row) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
const omit = (row, names) =>
  Object.fromEntries(
    Object.entries(row).filter(([name]) => !names.includes(name)),
  );

/** Preserve every trip/call field except IDs and literal arrival/departure times. */
function journeys(tables) {
  const calls = new Map();
  for (const row of tables['stop_times.txt'] ?? []) {
    const list = calls.get(row.trip_id) ?? [];
    list.push(row);
    calls.set(row.trip_id, list);
  }
  const groups = new Map();
  for (const trip of tables['trips.txt'] ?? []) {
    const rows = (calls.get(trip.trip_id) ?? []).sort(
      (a, b) => Number(a.stop_sequence) - Number(b.stop_sequence),
    );
    // Unknown fields, pickup/drop-off rules, timepoints and repeated calls remain in the signature.
    const signature = JSON.stringify([
      encode(omit(trip, ['trip_id'])),
      rows.map((row) =>
        encode({
          ...omit(row, ['trip_id', 'arrival_time', 'departure_time']),
          hasArrival: Boolean(row.arrival_time),
          hasDeparture: Boolean(row.departure_time),
        }),
      ),
    ]);
    const departures = groups.get(signature) ?? [];
    const times = rows.flatMap((row) =>
      [row.arrival_time, row.departure_time]
        .filter(Boolean)
        .map(gtfsTimeSeconds),
    );
    if (times.some((time) => time === null))
      throw new Error('Invalid journey times');
    departures.push(times);
    groups.set(signature, departures);
  }
  return groups;
}

function within(left, right, limit) {
  return left.every((times) =>
    right.some(
      (other) =>
        times.length === other.length &&
        times.every((time, i) => Math.abs(time - other[i]) <= limit),
    ),
  );
}

/** This is an allowlist. Unrecognized changes always require review. */
export function assessAutomaticUpdate({
  baseline,
  candidate,
  previousCapture,
  capture,
  policy: inputPolicy,
  now,
}) {
  const policy = automaticPublicationPolicySchema.parse(inputPolicy);
  const reasons = [];
  const hold = (reason) => reasons.push(reason);
  const audit = auditSchedule(candidate);
  if (audit.structuralErrors.length) hold('The source has structural errors.');
  if (capture.sha256 === previousCapture.sha256)
    return { decision: 'unchanged', reasons: [] };
  const retrieved = Date.parse(capture.retrieved_at);
  if (
    !Number.isFinite(retrieved) ||
    retrieved <= Date.parse(previousCapture.retrieved_at) ||
    retrieved > Date.parse(now)
  )
    hold('The capture is not a newer, already retrieved successor.');
  if (Date.parse(now) - retrieved > policy.maximumCaptureAgeHours * 3600000)
    hold('The capture is older than the automatic publication limit.');
  for (const field of [
    'feed_kind',
    'source',
    'licence_reference',
    'rights_status',
  ]) {
    if (capture[field] !== previousCapture[field])
      hold(`Capture ${field} changed.`);
  }
  if (
    capture.rights_status !== 'redistribution_permitted' ||
    capture.feed_kind !== 'schedule' ||
    capture.provider_timestamp !== previousCapture.provider_timestamp
  )
    hold('Capture rights, kind or provider timestamp needs review.');
  const names = [
    ...new Set([...Object.keys(baseline), ...Object.keys(candidate)]),
  ].sort();
  for (const name of names) {
    if (['trips.txt', 'stop_times.txt'].includes(name)) continue;
    if (
      policy.scope === 'canonical-schedule' &&
      ['calendar.txt', 'calendar_dates.txt'].includes(name)
    )
      continue;
    const normalize = (rows) => rows?.map(encode).sort();
    if (
      !isDeepStrictEqual(normalize(baseline[name]), normalize(candidate[name]))
    )
      hold(
        `${name} changed; calendars, stops, routes and other source tables require review.`,
      );
  }
  if (policy.scope === 'canonical-schedule') {
    // Permit new paths and calendar IDs, but never new access, timepoint or unknown metadata.
    for (const [name, ignored] of [
      [
        'trips.txt',
        [
          'trip_id',
          'service_id',
          'block_id',
          'trip_headsign',
          'direction_id',
          'route_id',
        ],
      ],
      [
        'stop_times.txt',
        ['trip_id', 'stop_sequence', 'arrival_time', 'departure_time'],
      ],
    ]) {
      const signature = (row) =>
        encode({
          ...omit(row, ignored),
          ...(name === 'stop_times.txt'
            ? {
                hasArrival: Boolean(row.arrival_time),
                hasDeparture: Boolean(row.departure_time),
              }
            : {}),
        });
      const allowed = new Set((baseline[name] ?? []).map(signature));
      if ((candidate[name] ?? []).some((row) => !allowed.has(signature(row))))
        hold(
          `New ${name} boarding, timing-presence or other metadata requires review.`,
        );
    }
    if (
      candidate['trips.txt'].some(
        (trip) => !['', '0', '1'].includes(trip.direction_id ?? ''),
      )
    )
      hold('An unsupported source direction needs review.');
    return {
      decision: reasons.length ? 'hold' : 'eligible',
      reasons: [...new Set(reasons)],
    };
  }
  const oldGroups = journeys(baseline);
  const newGroups = journeys(candidate);
  if (
    !isDeepStrictEqual(
      [...oldGroups.keys()].sort(),
      [...newGroups.keys()].sort(),
    )
  ) {
    hold(
      'Journey paths, calendars, boarding rules or other trip/call metadata changed.',
    );
  } else {
    for (const [key, oldTimes] of oldGroups) {
      const newTimes = newGroups.get(key);
      if (
        Math.abs(newTimes.length - oldTimes.length) / oldTimes.length >
        policy.maximumTripCountChangeFraction
      ) {
        hold('A journey group changed its trip count by more than 10%.');
        break;
      }
      if (
        !within(oldTimes, newTimes, policy.maximumDepartureShiftSeconds) ||
        !within(newTimes, oldTimes, policy.maximumDepartureShiftSeconds)
      ) {
        hold(
          'A journey changed its call times by more than 30 minutes from every corresponding journey.',
        );
        break;
      }
    }
  }
  return {
    decision: reasons.length ? 'hold' : 'eligible',
    reasons: [...new Set(reasons)],
  };
}
