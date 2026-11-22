import { isDeepStrictEqual } from 'node:util';
import {
  auditSchedule,
  gtfsTimeSeconds,
} from '../packages/fs/dist/gtfs/schedule.js';
import { resolveScheduledHolidayDates } from '../packages/fs/dist/gtfs/scheduledHolidayPolicy.js';
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
) {
  const oldPatterns = auditSchedule(baselineInputs.context.tables).patterns;
  const patterns = auditSchedule(inputs.context.tables).patterns;
  const range = inputs.applicabilityPolicy.serviceDateRange;
  const primaryFields = [
    'weekdayCalendarId',
    'saturdayCalendarId',
    'sundayCalendarId',
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
    for (const field of primaryFields) {
      const old = scheduledServiceCalendarFromGtfs(
        baselineInputs.context.tables,
        family[field],
      );
      const matches = used.filter((id) =>
        isDeepStrictEqual(
          scheduledServiceCalendarFromGtfs(inputs.context.tables, id).weekly,
          old.weekly,
        ),
      );
      requireCheck(
        matches.length === 1,
        `The ${family.lineId} ${field} calendar has no unique successor.`,
      );
      family[field] = matches[0];
    }
    family.supplementalCalendarIds = used
      .filter((id) => !primaryFields.some((field) => family[field] === id))
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

function dailySchedule(inputs, draft) {
  const trips = new Map(
    inputs.context.tables['trips.txt'].map((trip) => [trip.trip_id, trip]),
  );
  const calls = new Map();
  for (const row of inputs.context.tables['stop_times.txt']) {
    const list = calls.get(row.trip_id) ?? [];
    list.push(row);
    calls.set(row.trip_id, list);
  }
  const days = new Map();
  for (const pattern of draft.associationReview.patterns) {
    for (const date of pattern.supportedServiceDates) {
      const key = JSON.stringify([pattern.lineId, date]);
      const day = days.get(key) ?? { count: 0, times: new Map() };
      day.count += pattern.tripIds.length;
      for (const id of pattern.tripIds) {
        const trip = trips.get(id);
        for (const row of calls.get(id)) {
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
          }
        }
      }
      days.set(key, day);
    }
  }
  for (const day of days.values()) {
    for (const [key, times] of day.times)
      day.times.set(
        key,
        [...times].sort((a, b) => a - b),
      );
  }
  return days;
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
  const before = dailySchedule(baselineInputs, baselineDraft);
  const after = dailySchedule(inputs, draft);
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
