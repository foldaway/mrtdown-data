import { isDeepStrictEqual } from 'node:util';
import { compareStopSequences } from '../packages/fs/dist/gtfs/order.js';
import {
  auditSchedule,
  gtfsTimeSeconds,
} from '../packages/fs/dist/gtfs/schedule.js';
import {
  resolveScheduledHolidayDates,
  scheduledCalendarPartitionBounds,
  scheduledHolidayPrimaryCalendarIds,
} from '../packages/fs/dist/gtfs/scheduledHolidayPolicy.js';
import { scheduledServiceCalendarFromGtfs } from '../packages/fs/dist/gtfs/scheduledServiceCalendar.js';
import { validateSharedServiceSegment } from '../packages/fs/dist/gtfs/sharedServiceTarget.js';
import {
  createScheduledSourceJourneyMappingDraft,
  groupedScopedReviewDraftSha256,
  proposeScheduleReconciliation,
} from '../packages/fs/dist/index.js';

const inRange = (range, date) =>
  date >= range.startDate && date < range.endDateExclusive;
const patternShape = ({ routeId, direction, stopIds }) =>
  JSON.stringify([routeId, direction, stopIds]);

/** Rebind explicit assumptions, never invent a new unusual journey or holiday rule. */
export function planAutomaticMappings(
  baselineInputs,
  inputs,
  provenance,
  requireCheck,
  allowCalendarSegments = false,
) {
  const oldPatterns = auditSchedule(baselineInputs.context.tables).patterns;
  const patterns = auditSchedule(inputs.context.tables).patterns;
  const range = inputs.applicabilityPolicy.serviceDateRange;
  const primaryFields = [
    'weekdayCalendarId',
    'saturdayCalendarId',
    'sundayCalendarId',
  ];
  const additionalFields = [
    'additionalWeekdayCalendarIds',
    'additionalSaturdayCalendarIds',
    'additionalSundayCalendarIds',
  ];
  inputs.holidayPolicy.schemaVersion = 2;
  inputs.holidayPolicy.revision = 'automatic-source-calendars-v2';
  const identities = proposeScheduleReconciliation(
    inputs.context.tables,
    inputs.context.identity,
    inputs.context.topology,
  );
  for (const family of inputs.holidayPolicy.families) {
    family.providerRouteIds = [
      ...new Set([
        ...family.providerRouteIds,
        ...identities.entries
          .filter(
            (entry) =>
              entry.kind === 'route' &&
              entry.candidates.length === 1 &&
              entry.candidates[0].kind === 'line' &&
              entry.candidates[0].id === family.lineId,
          )
          .map((entry) => entry.providerId),
      ]),
    ].sort();
    const used = [
      ...new Set(
        patterns
          .filter((pattern) =>
            family.providerRouteIds.includes(pattern.routeId),
          )
          .map((pattern) => pattern.calendarId),
      ),
    ];
    const previousGroups = scheduledHolidayPrimaryCalendarIds(family);
    for (const [index, field] of primaryFields.entries()) {
      const oldSegments = previousGroups[index].map(
        (id) =>
          scheduledServiceCalendarFromGtfs(baselineInputs.context.tables, id)
            .weekly,
      );
      const oldWeekly = {
        ...oldSegments[0],
        ...scheduledCalendarPartitionBounds(oldSegments),
      };
      const matches = used.filter((id) =>
        isDeepStrictEqual(
          scheduledServiceCalendarFromGtfs(inputs.context.tables, id).weekly,
          oldWeekly,
        ),
      );
      let successors = matches;
      if (!matches.length && allowCalendarSegments) {
        const segments = used
          .map((id) => ({
            id,
            weekly: scheduledServiceCalendarFromGtfs(inputs.context.tables, id)
              .weekly,
          }))
          .filter(
            ({ weekly }) =>
              weekly &&
              isDeepStrictEqual(weekly.weekdays, oldWeekly.weekdays) &&
              weekly.startDate >= oldWeekly.startDate &&
              weekly.endDate <= oldWeekly.endDate,
          )
          .sort(
            (a, b) =>
              a.weekly.startDate.localeCompare(b.weekly.startDate) ||
              a.id.localeCompare(b.id),
          );
        requireCheck(
          segments.length > 1 &&
            isDeepStrictEqual(
              scheduledCalendarPartitionBounds(
                segments.map(({ weekly }) => weekly),
              ),
              { startDate: oldWeekly.startDate, endDate: oldWeekly.endDate },
            ),
          `The ${family.lineId} ${field} calendar has no complete successor partition.`,
        );
        successors = segments.map(({ id }) => id);
      } else {
        requireCheck(
          matches.length === 1,
          `The ${family.lineId} ${field} calendar has no unique successor.`,
        );
      }
      family[field] = successors[0];
      delete family[additionalFields[index]];
      if (successors.length > 1) {
        family[additionalFields[index]] = successors.slice(1);
        inputs.holidayPolicy.schemaVersion = 3;
        inputs.holidayPolicy.revision = 'automatic-source-calendar-segments-v3';
      }
    }
    const primaryIds = scheduledHolidayPrimaryCalendarIds(family).flat();
    family.supplementalCalendarIds = used
      .filter((id) => !primaryIds.includes(id))
      .sort();
  }
  const resolved = resolveScheduledHolidayDates(
    inputs.context,
    inputs.holidayPolicy,
    inputs.holidayCalendar,
  );
  const dates = new Map(
    resolved.patterns.map((pattern) => [
      pattern.providerPatternId,
      pattern.serviceDates.filter((date) => inRange(range, date)),
    ]),
  );
  inputs.sourceJourneyPolicy.journeys =
    baselineInputs.sourceJourneyPolicy.journeys.flatMap((rule) => {
      const old = oldPatterns.find(
        (pattern) => pattern.id === rule.providerPatternId,
      );
      requireCheck(
        old,
        'The predecessor source-journey assumption has no pattern.',
      );
      return patterns
        .filter((pattern) => patternShape(pattern) === patternShape(old))
        .flatMap((pattern) => {
          const serviceDates = dates
            .get(pattern.id)
            .filter((date) => rule.serviceDates.includes(date));
          return serviceDates.length
            ? [
                {
                  ...rule,
                  providerPatternId: pattern.id,
                  serviceDates,
                  reason: `${rule.reason}\n${provenance}`,
                },
              ]
            : [];
        });
    });
  requireCheck(
    inputs.sourceJourneyPolicy.journeys.length > 0,
    'No reviewed source-journey assumptions can be carried forward.',
  );
  const carried = new Map();
  for (const rule of inputs.sourceJourneyPolicy.journeys) {
    const previous = carried.get(rule.providerPatternId);
    requireCheck(
      !previous ||
        (previous.lineId === rule.lineId &&
          previous.serviceId === rule.serviceId),
      'The carried source-journey target is ambiguous.',
    );
    carried.set(rule.providerPatternId, {
      ...rule,
      reason: provenance,
      serviceDates: [
        ...new Set([...(previous?.serviceDates ?? []), ...rule.serviceDates]),
      ].sort(),
    });
  }
  inputs.sourceJourneyPolicy.journeys = [...carried.values()];
  const grouped = createScheduledSourceJourneyMappingDraft(
    inputs.context,
    inputs.sourceJourneyPolicy,
    inputs.allocationPolicy,
    inputs.holidayPolicy,
    inputs.holidayCalendar,
  );
  const claims = [];
  for (const pattern of grouped.dateReview.patterns) {
    for (const scope of pattern.dateScopes.scopes) {
      const serviceDates = scope.serviceDates.filter((date) =>
        inRange(range, date),
      );
      if (!serviceDates.length || scope.candidates.length < 2) continue;
      requireCheck(
        scope.candidates.every((member) => member.kind === 'serviceRevision'),
        'An ambiguous noncanonical journey requires review.',
      );
      // The whole candidate set must describe identical complete occurrences and codes.
      // No alternative is selected or discarded. The final association review checks
      // dates, operators, every physical platform and passenger access independently.
      validateSharedServiceSegment(
        inputs.context,
        pattern.stopIds,
        scope.candidates,
      );
      claims.push({
        providerPatternId: pattern.providerPatternId,
        serviceDates,
        target: { kind: 'sharedServiceRevisions', members: scope.candidates },
        reason: provenance,
      });
    }
  }
  inputs.sharedServiceMemberships = claims.length
    ? {
        schemaVersion: 1,
        documentKind: 'gtfs-shared-service-membership-claims',
        baseDraftSha256: groupedScopedReviewDraftSha256(
          grouped.mapping.mapping,
        ),
        claims,
      }
    : undefined;
}

function accessProfile(row) {
  const fields = Object.entries(row).filter(
    ([key]) =>
      ![
        'trip_id',
        'stop_id',
        'stop_sequence',
        'arrival_time',
        'departure_time',
        'stop_headsign',
      ].includes(key),
  );
  return JSON.stringify(
    Object.fromEntries(fields.sort(([a], [b]) => a.localeCompare(b))),
  );
}

function mixedAccessStops(...tables) {
  const profiles = new Map();
  for (const table of tables) {
    for (const row of table['stop_times.txt']) {
      const set = profiles.get(row.stop_id) ?? new Set();
      set.add(accessProfile(row));
      profiles.set(row.stop_id, set);
    }
  }
  return new Set(
    [...profiles].filter(([, profiles]) => profiles.size > 1).map(([id]) => id),
  );
}

function dailySchedule(inputs, draft, mixedStops) {
  const trips = new Map(
    inputs.context.tables['trips.txt'].map((trip) => [trip.trip_id, trip]),
  );
  const calls = new Map();
  for (const row of inputs.context.tables['stop_times.txt']) {
    const list = calls.get(row.trip_id) ?? [];
    list.push({
      row,
      profile: mixedStops.has(row.stop_id) ? accessProfile(row) : null,
    });
    calls.set(row.trip_id, list);
  }
  for (const list of calls.values()) {
    if (!list.some((call) => call.profile !== null)) continue;
    list.sort((a, b) =>
      compareStopSequences(a.row.stop_sequence, b.row.stop_sequence),
    );
    const path = JSON.stringify(list.map(({ row }) => row.stop_id));
    for (const [index, call] of list.entries()) call.occurrence = [path, index];
  }
  const days = new Map();
  for (const pattern of draft.associationReview.patterns) {
    for (const date of pattern.supportedServiceDates) {
      const key = JSON.stringify([pattern.lineId, date]);
      const day = days.get(key) ?? {
        count: 0,
        times: new Map(),
        access: new Map(),
      };
      day.count += pattern.tripIds.length;
      for (const id of pattern.tripIds) {
        const trip = trips.get(id);
        for (const { row, profile, occurrence } of calls.get(id)) {
          for (const field of ['arrival_time', 'departure_time']) {
            if (!row[field]) continue;
            const key = JSON.stringify([
              trip.direction_id ?? '',
              row.stop_id,
              field,
            ]);
            const times = day.times.get(key) ?? [];
            times.push(gtfsTimeSeconds(row[field]));
            day.times.set(key, times);
            if (profile !== null) {
              const accessKey = JSON.stringify([
                trip.route_id ?? '',
                occurrence,
                key,
              ]);
              const access = day.access.get(accessKey) ?? [];
              access.push([gtfsTimeSeconds(row[field]), profile]);
              day.access.set(accessKey, access);
            }
          }
        }
      }
      days.set(key, day);
    }
  }
  for (const day of days.values()) {
    for (const [key, access] of day.access) {
      access.sort(([a, x], [b, y]) => a - b || x.localeCompare(y));
      day.access.set(
        key,
        access.map(([, profile]) => profile),
      );
    }
    for (const [key, times] of day.times)
      day.times.set(
        key,
        [...times].sort((a, b) => a - b),
      );
  }
  return days;
}

/** Maximum cardinality pairing of sorted calls; a counterpart is consumed once. */
function matchedCallCount(left, right, limit) {
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < left.length && j < right.length) {
    if (Math.abs(left[i] - right[j]) <= limit) {
      matched++;
      i++;
      j++;
    } else if (left[i] < right[j]) i++;
    else j++;
  }
  return matched;
}

function unmatchedFraction(times, others, limit) {
  if (!others?.length) return 1;
  let index = 0;
  let unmatched = 0;
  for (const time of times) {
    while (
      index + 1 < others.length &&
      Math.abs(others[index + 1] - time) <= Math.abs(others[index] - time)
    )
      index++;
    if (Math.abs(others[index] - time) > limit) unmatched++;
  }
  return unmatched / times.length;
}

/** Check the actual effective service dates, not duplicated raw calendar templates. */
export function checkAutomaticDailyChanges(
  baselineInputs,
  baselineDraft,
  inputs,
  draft,
  policy,
  requireCheck,
) {
  const mixedStops = mixedAccessStops(
    baselineInputs.context.tables,
    inputs.context.tables,
  );
  const before = dailySchedule(baselineInputs, baselineDraft, mixedStops);
  const after = dailySchedule(inputs, draft, mixedStops);
  requireCheck(
    isDeepStrictEqual([...before.keys()].sort(), [...after.keys()].sort()),
    'A line gained or lost an entire supported service date.',
  );
  for (const [key, old] of before) {
    const current = after.get(key);
    requireCheck(
      Math.abs(current.count - old.count) / old.count <=
        policy.maximumTripCountChangeFraction,
      `${key} changed its daily trip count by more than 10%.`,
    );
    requireCheck(
      isDeepStrictEqual(old.access, current.access),
      `${key} changed the order or number of timed boarding/access profiles. Mixed permissions require review.`,
    );
    for (const [stop, times] of old.times) {
      const others = current.times.get(stop) ?? [];
      const matched = matchedCallCount(
        times,
        others,
        policy.maximumDepartureShiftSeconds,
      );
      requireCheck(
        (times.length - matched) / times.length <=
          policy.maximumTripCountChangeFraction,
        `${key} ${stop} lost distinct timing counterparts for more than 10% of its calls.`,
      );
    }
    for (const [left, right] of [
      [old, current],
      [current, old],
    ]) {
      for (const [stop, times] of left.times) {
        const other = right.times.get(stop);
        requireCheck(
          other &&
            (left !== old ||
              (times.length - other.length) / times.length <=
                policy.maximumTripCountChangeFraction),
          `${key} ${stop} lost more than 10% of its station calls or has no counterpart.`,
        );
        requireCheck(
          unmatchedFraction(
            times,
            other,
            policy.maximumDepartureShiftSeconds,
          ) <= policy.maximumTripCountChangeFraction,
          `${key} ${stop} has more than 10% unmatched calls with changes over 30 minutes.`,
        );
      }
    }
  }
}
