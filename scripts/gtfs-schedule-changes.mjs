import { compareStopSequences } from '../packages/fs/dist/gtfs/order.js';
import { gtfsTimeSeconds } from '../packages/fs/dist/gtfs/schedule.js';
import { hashBytes } from '../packages/fs/dist/index.js';

const digest = (value) => hashBytes(Buffer.from(JSON.stringify(value)));
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const continuousRule = (call, route, field) =>
  call[field] || route[field] || '1';
const counts = (values) => {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
};
function subtract(left, right) {
  return [...left]
    .sort(([a], [b]) => compare(a, b))
    .flatMap(([key, count]) =>
      Array(Math.max(0, count - (right.get(key) ?? 0))).fill(key),
    );
}
function time(seconds) {
  if (seconds === null) return null;
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Only compare structurally validated, explicitly timed schedules. Provider trip,
// calendar and block IDs do not identify a journey across captures.
function model(tables, coverage) {
  if (tables['frequencies.txt']?.length)
    throw new Error('Frequency-based schedules require a separate comparison');
  const routes = new Map(
    tables['routes.txt'].map((route) => [route.route_id, route]),
  );
  const stops = new Map(
    tables['stops.txt'].map((stop) => [stop.stop_id, stop]),
  );
  const stopTimes = new Map();
  for (const row of tables['stop_times.txt']) {
    if (row.start_pickup_drop_off_window || row.end_pickup_drop_off_window) {
      throw new Error(
        'Flexible pickup/drop-off windows require a separate comparison',
      );
    }
    const rows = stopTimes.get(row.trip_id) ?? [];
    rows.push(row);
    stopTimes.set(row.trip_id, rows);
  }
  const lines = new Map();
  for (const trip of tables['trips.txt']) {
    const route = routes.get(trip.route_id);
    const label =
      route.route_long_name || route.route_short_name || route.route_id;
    // LTA has multiple route IDs per line; combine only explicitly identical
    // agency/type/line names. Anonymous routes keep their own provider identity.
    const lineKey = JSON.stringify([
      route.agency_id,
      route.route_type,
      route.route_short_name || '',
      route.route_long_name || '',
      route.route_short_name || route.route_long_name ? '' : route.route_id,
    ]);
    const line = lines.get(lineKey) ?? {
      label,
      services: new Map(),
      variants: new Map(),
      days: new Map(),
    };
    const calls = [...(stopTimes.get(trip.trip_id) ?? [])].sort((a, b) =>
      compareStopSequences(a.stop_sequence, b.stop_sequence),
    );
    if (!calls.length)
      throw new Error(`Trip ${trip.trip_id} has no stop times`);
    const segmentRule = (call, index, field) =>
      index < calls.length - 1 ? continuousRule(call, route, field) : '1';
    const pattern = calls.map((call, index) => [
      call.stop_id,
      stops.get(call.stop_id).platform_code || '',
      call.pickup_type || '0',
      call.drop_off_type || '0',
      segmentRule(call, index, 'continuous_pickup'),
      segmentRule(call, index, 'continuous_drop_off'),
    ]);
    const patternKey = digest([trip.direction_id || '', pattern]);
    const times = calls.map((call, index) => {
      const arrival = gtfsTimeSeconds(call.arrival_time);
      const departure = gtfsTimeSeconds(call.departure_time);
      const exact = (call.timepoint || '1') === '1';
      if (
        ((exact || index === 0 || index === calls.length - 1) &&
          arrival === null) ||
        ((exact || index === 0) && departure === null)
      ) {
        throw new Error(
          `Missing required arrival/departure time for trip ${trip.trip_id}, call ${index + 1}; origin departure times must be supplied for comparison`,
        );
      }
      return [arrival, departure];
    });
    const labels = [
      trip.trip_headsign || '',
      trip.trip_short_name || '',
      trip.wheelchair_accessible || '0',
      trip.bikes_allowed || '0',
      calls.map((call) => [call.stop_headsign || '', call.timepoint || '1']),
    ];
    const journey = {
      signature: digest([patternKey, times, labels]),
      timingSignature: digest(times),
      times,
      labels,
      patternKey,
      departure: times[0]?.[1] ?? null,
      // Endpoint display includes platform labels where supplied. Repeated stop
      // occurrences remain in both the pattern identity and ordered evidence.
      stops: calls.map((call, index) => {
        const stop = stops.get(call.stop_id);
        return {
          id: call.stop_id,
          name: stop.stop_name || stop.stop_id,
          platform: stop.platform_code || '',
          pickup: call.pickup_type || '0',
          dropOff: call.drop_off_type || '0',
          continuousPickup: segmentRule(call, index, 'continuous_pickup'),
          continuousDropOff: segmentRule(call, index, 'continuous_drop_off'),
        };
      }),
    };
    const journeys = line.services.get(trip.service_id) ?? [];
    journeys.push(journey);
    line.services.set(trip.service_id, journeys);
    lines.set(lineKey, line);
  }
  for (const line of lines.values()) {
    for (const service of coverage.services) {
      if (!line.services.has(service.serviceId)) continue;
      for (const date of service.dates) {
        const ids = line.days.get(date) ?? [];
        ids.push(service.serviceId);
        line.days.set(date, ids);
      }
    }
    for (const [date, ids] of line.days) {
      const key = JSON.stringify(ids.sort());
      if (!line.variants.has(key))
        line.variants.set(
          key,
          variant(ids.flatMap((id) => line.services.get(id))),
        );
      line.days.set(date, key);
    }
  }
  return lines;
}

function variant(journeys) {
  const signatures = counts(journeys.map((journey) => journey.signature));
  const patterns = new Map();
  for (const journey of journeys) {
    const pattern = patterns.get(journey.patternKey) ?? {
      stops: journey.stops,
      journeys: [],
    };
    pattern.journeys.push(journey);
    patterns.set(journey.patternKey, pattern);
  }
  return {
    sha256: digest([...signatures].sort(([a], [b]) => compare(a, b))),
    signatures,
    patterns,
    count: journeys.length,
  };
}
const empty = variant([]);
function uniqueIndex(journeys, key) {
  const index = new Map();
  for (const journey of journeys) {
    const value = journey[key];
    index.set(value, index.has(value) ? null : journey);
  }
  return new Map([...index].sort(([a], [b]) => compare(a, b)));
}
function exactExamples(previous, next) {
  const callTimes = [];
  const details = [];
  const origins = uniqueIndex(previous, 'departure');
  const timings = uniqueIndex(previous, 'timingSignature');
  for (const [departure, journey] of uniqueIndex(next, 'departure')) {
    const old = origins.get(departure);
    if (!journey || !old || departure === null) continue;
    for (let i = 0; i < journey.times.length; i++) {
      if (
        JSON.stringify(old.times[i]) !== JSON.stringify(journey.times[i]) &&
        callTimes.length < 3
      ) {
        callTimes.push({
          originTime: time(departure),
          occurrence: i + 1,
          stop: journey.stops[i],
          before: old.times[i].map(time),
          after: journey.times[i].map(time),
        });
      }
    }
  }
  for (const [signature, journey] of uniqueIndex(next, 'timingSignature')) {
    const old = timings.get(signature);
    if (!journey || !old) continue;
    for (const [index, field] of [
      'Destination display',
      'Trip name',
      'Wheelchair flag',
      'Bicycle flag',
    ].entries()) {
      if (old.labels[index] !== journey.labels[index] && details.length < 3) {
        details.push({
          originTime: time(journey.departure),
          field,
          before: old.labels[index],
          after: journey.labels[index],
        });
      }
    }
  }
  return { callTimes, details };
}
function window(pattern) {
  const departures = (pattern?.journeys ?? [])
    .map((journey) => journey.departure)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  return {
    count: pattern?.journeys.length ?? 0,
    first: time(departures[0] ?? null),
    last: time(departures.at(-1) ?? null),
  };
}

function change(before, after) {
  const removedJourneys = subtract(before.signatures, after.signatures).length;
  const addedJourneys = subtract(after.signatures, before.signatures).length;
  const patterns = [];
  for (const key of [
    ...new Set([...before.patterns.keys(), ...after.patterns.keys()]),
  ].sort()) {
    const previous = before.patterns.get(key);
    const next = after.patterns.get(key);
    const a = counts(
      (previous?.journeys ?? []).map((journey) => journey.signature),
    );
    const b = counts(
      (next?.journeys ?? []).map((journey) => journey.signature),
    );
    if (!subtract(a, b).length && !subtract(b, a).length) continue;
    const oldDepartures = counts(
      (previous?.journeys ?? []).map((journey) => journey.departure),
    );
    const newDepartures = counts(
      (next?.journeys ?? []).map((journey) => journey.departure),
    );
    const removed = subtract(oldDepartures, newDepartures).sort(
      (a, b) => (a ?? -1) - (b ?? -1),
    );
    const added = subtract(newDepartures, oldDepartures).sort(
      (a, b) => (a ?? -1) - (b ?? -1),
    );
    const timingBefore = counts(
      (previous?.journeys ?? []).map((journey) => journey.timingSignature),
    );
    const timingAfter = counts(
      (next?.journeys ?? []).map((journey) => journey.timingSignature),
    );
    patterns.push({
      patternSha256: key,
      // Display names belong to this snapshot; shared service identities must
      // not overwrite another change's baseline names.
      definitionSha256: digest((next ?? previous).stops),
      stops: (next ?? previous).stops,
      before: window(previous),
      after: window(next),
      status: !previous
        ? 'new-pattern'
        : !next
          ? 'removed-pattern'
          : 'changed-pattern',
      timingChanged:
        subtract(timingBefore, timingAfter).length > 0 ||
        subtract(timingAfter, timingBefore).length > 0,
      removedDepartureCount: removed.length,
      addedDepartureCount: added.length,
      // Examples are bounded; counts and fingerprints retain full comparisons.
      removedDepartureExamples: removed.slice(0, 5).map(time),
      addedDepartureExamples: added.slice(0, 5).map(time),
      exactExamples: exactExamples(
        previous?.journeys ?? [],
        next?.journeys ?? [],
      ),
    });
  }
  patterns.sort(
    (a, b) =>
      b.addedDepartureCount +
        b.removedDepartureCount -
        (a.addedDepartureCount + a.removedDepartureCount) ||
      compare(a.patternSha256, b.patternSha256),
  );
  const highlights = patterns
    .filter((pattern) => pattern.status === 'changed-pattern')
    .slice(0, 5)
    .flatMap((pattern) =>
      ['first', 'last'].flatMap((kind) => {
        const previous = pattern.before[kind];
        const next = pattern.after[kind];
        if (previous === null || next === null || previous === next) return [];
        return [
          {
            patternSha256: pattern.patternSha256,
            definitionSha256: pattern.definitionSha256,
            kind,
            before: previous,
            after: next,
            differenceSeconds:
              gtfsTimeSeconds(next) - gtfsTimeSeconds(previous),
          },
        ];
      }),
    )
    .sort(
      (a, b) =>
        Math.abs(b.differenceSeconds) - Math.abs(a.differenceSeconds) ||
        compare(a.patternSha256, b.patternSha256) ||
        compare(a.kind, b.kind),
    )
    .slice(0, 1);
  return {
    beforeJourneyCount: before.count,
    afterJourneyCount: after.count,
    unchangedJourneyCount: before.count - removedJourneys,
    removedJourneySchedules: removedJourneys,
    addedJourneySchedules: addedJourneys,
    highlights,
    patterns,
  };
}

// Keep the usual line name, qualifying only names shared by distinct identities.
function labelsForLines(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const names = keys.map((key) => (after.get(key) ?? before.get(key)).label);
  const occurrences = counts(names);
  const labels = keys.map((key, index) => {
    const name = names[index];
    const [agency, , shortName] = JSON.parse(key);
    return occurrences.get(name) > 1
      ? `${name} (${shortName || agency || 'unnamed route'})`
      : name;
  });
  const qualified = counts(labels);
  return new Map(
    keys.map((key, index) => [
      key,
      qualified.get(labels[index]) > 1
        ? `${labels[index]} [${digest(key).slice(0, 12)}]`
        : labels[index],
    ]),
  );
}

export function compareJourneySchedules(
  beforeTables,
  afterTables,
  beforeCoverage,
  afterCoverage,
) {
  const before = model(beforeTables, beforeCoverage);
  const after = model(afterTables, afterCoverage);
  const lineLabels = labelsForLines(before, after);
  const changes = [];
  const unchangedLines = [];
  const unchangedDates = [];
  const patternDefinitions = {};
  const sourceDates = [
    ...new Set([...beforeCoverage.dates, ...afterCoverage.dates]),
  ].sort();
  for (const [key, label] of lineLabels) {
    const previous = before.get(key);
    const next = after.get(key);
    const grouped = new Map();
    const matchingDates = [];
    for (const date of [
      ...new Set([
        ...(previous?.days.keys() ?? []),
        ...(next?.days.keys() ?? []),
      ]),
    ].sort()) {
      const a = previous?.variants.get(previous.days.get(date)) ?? empty;
      const b = next?.variants.get(next.days.get(date)) ?? empty;
      if (a.sha256 === b.sha256) {
        matchingDates.push(date);
        continue;
      }
      const pair = `${a.sha256}:${b.sha256}`;
      if (!grouped.has(pair))
        grouped.set(pair, {
          line: label,
          lineKey: key,
          dates: [],
          beforeSha256: a.sha256,
          afterSha256: b.sha256,
          ...change(a, b),
        });
      grouped.get(pair).dates.push(date);
    }
    if (!grouped.size) unchangedLines.push(label);
    else if (matchingDates.length)
      unchangedDates.push({
        line: label,
        lineKey: key,
        dates: matchingDates,
      });
    for (const group of grouped.values()) {
      group.patterns = group.patterns.map(({ stops, ...pattern }) => {
        patternDefinitions[pattern.definitionSha256] = stops;
        return pattern;
      });
    }
    changes.push(...grouped.values());
  }
  changes.sort(
    (a, b) =>
      compare(a.line, b.line) ||
      a.dates.length - b.dates.length ||
      compare(a.dates[0], b.dates[0]),
  );
  return {
    status: 'available',
    basis:
      'Source-calendar daily multisets of ordered stop/platform IDs, boarding/alighting rules, direction, all arrival/departure times, timepoints, headsigns and trip-level wheelchair_accessible/bikes_allowed fields; trip/service/block IDs ignored. Stop-level accessibility changes appear in table drift. Identically named routes within the same agency/type form a line. No fuzzy trip pairing or canonical mapping reuse.',
    sourceDates,
    lineLabels: Object.fromEntries(lineLabels),
    unchangedLines,
    unchangedDates,
    patternDefinitions,
    changes,
  };
}

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const prettyDate = (date) =>
  `${Number(date.slice(8))} ${months[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
function dateText(dates, sourceDates) {
  if (dates.length <= 5) return dates.map(prettyDate).join(', ');
  const weekdays = [
    ...new Set(dates.map((date) => new Date(`${date}T00:00:00Z`).getUTCDay())),
  ].sort();
  const names = [
    'Sundays',
    'Mondays',
    'Tuesdays',
    'Wednesdays',
    'Thursdays',
    'Fridays',
    'Saturdays',
  ];
  const actual = new Set(dates);
  // A date absent from both feeds still breaks a weekly recurrence. Check the
  // displayed interval, stopping as soon as the exact-date fallback is needed.
  const excluded = [];
  const end = Date.parse(`${sourceDates.at(-1)}T00:00:00Z`);
  for (
    let instant = Date.parse(`${sourceDates[0]}T00:00:00Z`);
    instant <= end;
    instant += 86_400_000
  ) {
    const day = new Date(instant);
    if (!weekdays.includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    if (!actual.has(date)) excluded.push(date);
    if (excluded.length > 5) break;
  }
  if (weekdays.length <= 5 && excluded.length <= 5) {
    const label =
      JSON.stringify(weekdays) === '[1,2,3,4,5]'
        ? 'weekdays'
        : weekdays.map((day) => names[day]).join(', ');
    const fullYear =
      sourceDates[0].endsWith('-01-01') &&
      sourceDates.at(-1).endsWith('-12-31') &&
      sourceDates[0].slice(0, 4) === sourceDates.at(-1).slice(0, 4) &&
      sourceDates.length >= 365;
    const scope = fullYear
      ? `in ${sourceDates[0].slice(0, 4)}`
      : `within ${prettyDate(sourceDates[0])}–${prettyDate(sourceDates.at(-1))}`;
    return `${label} ${scope}${excluded.length ? `, except ${excluded.map(prettyDate).join(', ')}` : ''}`;
  }
  return `${dates.length} service dates from ${prettyDate(dates[0])} to ${prettyDate(dates.at(-1))} (exact dates in JSON)`;
}
function stopText(stop) {
  return `${stop.name}${stop.platform ? ` (platform ${stop.platform})` : ''}`;
}
function pathText(stops) {
  const endpoints = `${stopText(stops[0])} → ${stopText(stops.at(-1))}`;
  const via = stops.slice(1, -1).slice(0, 2).map(stopText).join(', ');
  return `${endpoints}${via ? ` via ${via}${stops.length > 4 ? ', …' : ''}` : ''} (${stops.length} calls)`;
}
function boardingRules(stops) {
  const pickup = {
    1: 'no boarding',
    2: 'phone the agency to arrange boarding',
    3: 'coordinate with the driver to board',
  };
  const dropOff = {
    1: 'no alighting',
    2: 'phone the agency to arrange alighting',
    3: 'coordinate with the driver to alight',
  };
  const continuous = (value, action) =>
    ({
      0: `continuous ${action} permitted`,
      2: `phone the agency to arrange continuous ${action}`,
      3: `coordinate with the driver for continuous ${action}`,
    })[value];
  return stops.flatMap((stop, index) => {
    const rules = [pickup[stop.pickup], dropOff[stop.dropOff]];
    if (index < stops.length - 1) {
      for (const [value, action] of [
        [stop.continuousPickup, 'boarding'],
        [stop.continuousDropOff, 'alighting'],
      ]) {
        const rule = continuous(value, action);
        if (rule) rules.push(`${rule} until the next call`);
      }
    }
    const text = rules.filter(Boolean).join('; ');
    return text ? [`${stopText(stop)} (call ${index + 1}): ${text}`] : [];
  });
}
function windowText(window) {
  return `${window.count} journeys${window.first ? `; origin times ${window.first}–${window.last}` : ''}`;
}

export function renderJourneyChanges(summary, markdownText) {
  const lines = ['## What changed', ''];
  if (summary?.status !== 'available') {
    return [
      ...lines,
      `A plain-language timetable comparison is unavailable: ${markdownText(summary?.reason ?? 'source dates or baseline could not be assessed')}. See the evidence below.`,
      '',
    ];
  }
  if (!summary.changes.length)
    lines.push(
      'The daily journey schedules are unchanged after ignoring provider trip, calendar and block IDs.',
    );
  else {
    lines.push(
      `Daily journey schedules changed for **${markdownText([...new Set(summary.changes.map((change) => change.line))].join(', '))}**.`,
      '',
    );
    for (const change of summary.changes.slice(0, 12)) {
      const difference = change.afterJourneyCount - change.beforeJourneyCount;
      const countText = difference
        ? `${Math.abs(difference)} ${difference < 0 ? 'fewer' : 'more'} scheduled journeys per date (${change.beforeJourneyCount} → ${change.afterJourneyCount})`
        : `the number of scheduled journeys stays at ${change.afterJourneyCount} per date, with changed journey details`;
      lines.push(
        `- **${markdownText(change.line)}, ${dateText(change.dates, summary.sourceDates)}:** ${countText}.`,
      );
      for (const highlight of change.highlights) {
        lines.push(
          `  - For ${markdownText(pathText(summary.patternDefinitions[highlight.definitionSha256]))}, the ${highlight.kind === 'first' ? 'earliest' : 'latest'} listed origin time changes from ${highlight.before} to **${highlight.after}**.`,
        );
      }
    }
    lines.push('');
    for (const item of summary.unchangedDates)
      lines.push(
        `${markdownText(item.line)} schedules on ${dateText(item.dates, summary.sourceDates)} are unchanged.`,
        '',
      );
    lines.push(
      '<details>',
      '<summary>Stopping patterns and exact departure examples</summary>',
      '',
    );
    for (const change of summary.changes.slice(0, 12)) {
      const countStatus = (status) =>
        change.patterns.filter((pattern) => pattern.status === status).length;
      lines.push(
        `**${markdownText(change.line)} — ${dateText(change.dates, summary.sourceDates)}**`,
        '',
        `${change.unchangedJourneyCount} journey schedules match exactly. Stopping patterns: ${countStatus('new-pattern')} added, ${countStatus('removed-pattern')} removed, ${countStatus('changed-pattern')} retained with changed journey details.`,
        '',
      );
      for (const pattern of change.patterns.slice(0, 5)) {
        const stops = summary.patternDefinitions[pattern.definitionSha256];
        const path = markdownText(pathText(stops));
        if (pattern.status === 'new-pattern')
          lines.push(
            `- Newly listed stopping pattern: ${path}. ${windowText(pattern.after)}.`,
          );
        else if (pattern.status === 'removed-pattern')
          lines.push(
            `- Stopping pattern no longer listed: ${path}. Previously ${windowText(pattern.before)}.`,
          );
        else {
          lines.push(
            `- ${path}: ${windowText(pattern.before)} → ${windowText(pattern.after)}.`,
          );
          if (pattern.removedDepartureCount || pattern.addedDepartureCount) {
            if (pattern.removedDepartureCount)
              lines.push(
                `  - ${pattern.removedDepartureCount} origin departure time(s) no longer listed; examples: ${pattern.removedDepartureExamples.map((value) => value ?? 'unspecified').join(', ')}.`,
              );
            if (pattern.addedDepartureCount)
              lines.push(
                `  - ${pattern.addedDepartureCount} origin departure time(s) newly listed; examples: ${pattern.addedDepartureExamples.map((value) => value ?? 'unspecified').join(', ')}.`,
              );
          } else
            lines.push(
              pattern.timingChanged
                ? '  - Origin departure times are retained; arrival/departure details within journeys change.'
                : '  - Timings are retained; passenger-facing journey details change.',
            );
          for (const example of pattern.exactExamples.callTimes) {
            lines.push(
              `  - For the ${example.originTime} origin departure, ${markdownText(stopText(example.stop))} (call ${example.occurrence}) changes from arrival/departure ${example.before.map((value) => value ?? 'unspecified').join('/')} to ${example.after.map((value) => value ?? 'unspecified').join('/')}.`,
            );
          }
          for (const example of pattern.exactExamples.details) {
            lines.push(
              `  - For the ${example.originTime ?? 'unspecified'} origin time, ${markdownText(example.field)} changes from “${markdownText(example.before || 'blank')}” to “${markdownText(example.after || 'blank')}”.`,
            );
          }
        }
        for (const rule of boardingRules(stops))
          lines.push(`  - ${markdownText(rule)}.`);
      }
      if (change.patterns.length > 5)
        lines.push(
          `- Details for ${change.patterns.length} patterns are retained in JSON; the five above have the most origin departure changes.`,
        );
      lines.push('');
    }
    lines.push('</details>', '');
    if (summary.changes.length > 12)
      lines.push('Further line/date groups are retained in JSON.', '');
  }
  if (summary.unchangedLines.length)
    lines.push(
      `Daily journey schedules for ${markdownText([...new Set(summary.unchangedLines)].join(', '))} are unchanged.`,
      '',
    );
  lines.push(
    'Counts describe source trip records, including short turns and non-boarding calls. Stop-level accessibility changes appear in the table comparison, outside these journey counts. Pattern time windows describe that exact pattern, not a station’s first/last passenger train. Times from 24:00 onward remain on their source service day. Mapping approval and publication coverage require separate review.',
    '',
  );
  return lines;
}
