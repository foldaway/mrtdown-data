import { compareStopSequences, compareStrings } from './order.js';
import {
  proposeScheduleReconciliation,
  type ReconciliationIdentity,
} from './reconciliation.js';
import { auditSchedule, type ScheduleTables } from './schedule.js';
import type { scheduleTopologyProjection } from './topology.js';

type Topology = ReturnType<typeof scheduleTopologyProjection>;
const weekdays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const dayMilliseconds = 86_400_000;
function required<T>(value: T | undefined): T {
  if (value === undefined)
    throw new Error('Missing reconciled topology record');
  return value;
}
function instant(value: string) {
  const iso = value.includes('-')
    ? value
    : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = Date.parse(`${iso}T00:00:00Z`);
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString().slice(0, 10) !== iso
  )
    throw new Error(`Invalid service date: ${value}`);
  return date;
}

/** Inclusive GTFS calendar bounds, exceptions override weekday service. */
export function activeServiceDates(tables: ScheduleTables, calendarId: string) {
  const dates = new Set<string>();
  const calendar = tables['calendar.txt']?.find(
    (row) => row.service_id === calendarId,
  );
  if (calendar) {
    const start = instant(calendar.start_date ?? '');
    const end = instant(calendar.end_date ?? '');
    if ((end - start) / dayMilliseconds > 36600)
      throw new Error('Calendar exceeds 100-year reconciliation audit limit');
    for (let value = start; value <= end; value += dayMilliseconds) {
      const date = new Date(value);
      if (calendar[required(weekdays[date.getUTCDay()])] === '1')
        dates.add(date.toISOString().slice(0, 10));
    }
  }
  for (const row of tables['calendar_dates.txt'] ?? []) {
    if (row.service_id !== calendarId) continue;
    const date = new Date(instant(row.date ?? '')).toISOString().slice(0, 10);
    if (row.exception_type === '1') dates.add(date);
    if (row.exception_type === '2') dates.delete(date);
  }
  return [...dates].sort(compareStrings);
}
function effective(date: string, start: string, end: string | null) {
  // Canonical revision/code periods use inclusive starts and exclusive ends.
  instant(start);
  if (end) instant(end);
  return date >= start && (!end || date < end);
}
function pickupDropOff(rows: ScheduleTables[string]) {
  return [
    ...new Set(
      rows.map((row) =>
        JSON.stringify({
          pickup: row.pickup_type || '0',
          dropOff: row.drop_off_type || '0',
        }),
      ),
    ),
  ]
    .sort(compareStrings)
    .map((value) => JSON.parse(value) as { pickup: string; dropOff: string });
}

/** Evidence for a reviewer, never a review artifact or permission to generate. */
export function buildReconciliationEvidence(
  tables: ScheduleTables,
  identity: ReconciliationIdentity,
  topology: Topology,
) {
  const report = proposeScheduleReconciliation(tables, identity, topology);
  const audit = auditSchedule(tables);
  const stops = new Map(
    (tables['stops.txt'] ?? []).map((row) => [row.stop_id, row]),
  );
  const entries = new Map(
    report.entries.map((entry) => [`${entry.kind}:${entry.providerId}`, entry]),
  );
  const dates = new Map(
    [...new Set(audit.patterns.map((pattern) => pattern.calendarId))].map(
      (id) => [id, activeServiceDates(tables, id)],
    ),
  );
  const stopTimes = new Map<string, ScheduleTables[string]>();
  for (const row of tables['stop_times.txt'] ?? []) {
    const rows = stopTimes.get(row.trip_id ?? '') ?? [];
    rows.push(row);
    stopTimes.set(row.trip_id ?? '', rows);
  }
  for (const rows of stopTimes.values())
    rows.sort((a, b) =>
      compareStopSequences(a.stop_sequence ?? '', b.stop_sequence ?? ''),
    );
  const patterns = audit.patterns.map((pattern) => {
    const entry = required(entries.get(`pattern:${pattern.id}`));
    const activeDates = required(dates.get(pattern.calendarId));
    const restrictions = pickupDropOff(
      pattern.tripIds.flatMap((id) => stopTimes.get(id) ?? []),
    );
    const occurrenceRestrictions = pattern.stopIds.map((_, index) =>
      pickupDropOff(
        pattern.tripIds.map((id) => required(stopTimes.get(id)?.[index])),
      ),
    );
    const candidates = entry.candidates.map((target) => {
      const service = required(
        topology.services.find((service) => service.id === target.id),
      );
      const revision = required(
        service.revisions.find((revision) => revision.id === target.revisionId),
      );
      const revisionDates = activeDates.filter((date) =>
        effective(date, revision.startAt, revision.endAt),
      );
      const occurrences = pattern.stopIds.map((stopId, index) => {
        const row = required(stops.get(stopId));
        const matches = required(entries.get(`stop:${stopId}`)).candidates;
        const platforms = matches
          .filter((match) => match.kind === 'platform')
          .map((match) => {
            const station = required(
              topology.stations.find(
                (station) => station.id === match.stationId,
              ),
            );
            const platform = required(
              station.platforms.find((platform) => platform.id === match.id),
            );
            const validDates = revisionDates.filter((date) =>
              station.stationCodes.some(
                (code) =>
                  code.code === row.stop_code &&
                  code.lineId === service.lineId &&
                  effective(date, code.startedAt, code.endedAt),
              ),
            );
            return {
              platformId: platform.id,
              serviceScope: platform.serviceIds.length
                ? platform.serviceIds.includes(service.id)
                  ? ('listed' as const)
                  : ('excluded' as const)
                : ('unspecified' as const),
              boardingStatus: platform.boardingStatus,
              validDateCount: validDates.length,
            };
          });
        return {
          index,
          stopId,
          pickupDropOff: required(occurrenceRestrictions[index]),
          platforms,
        };
      });
      const platformConflicts = occurrences
        .filter(
          (occurrence) =>
            !occurrence.platforms.some(
              (platform) =>
                platform.serviceScope !== 'excluded' &&
                platform.boardingStatus !== 'not_in_service',
            ),
        )
        .map((occurrence) => occurrence.index);
      const boardingConflicts = occurrences
        .filter(
          (occurrence) =>
            occurrence.index < pattern.stopIds.length - 1 &&
            occurrence.platforms.some(
              (platform) => platform.serviceScope !== 'excluded',
            ) &&
            occurrence.platforms
              .filter((platform) => platform.serviceScope !== 'excluded')
              .every(
                (platform) =>
                  platform.boardingStatus === 'alighting_only' ||
                  platform.boardingStatus === 'not_in_service',
              ) &&
            occurrence.pickupDropOff.some(
              (restriction) => restriction.pickup !== '1',
            ),
        )
        .map((occurrence) => occurrence.index);
      const fullDateCoverage =
        activeDates.length > 0 &&
        revisionDates.length === activeDates.length &&
        occurrences.every((occurrence) =>
          occurrence.platforms.some(
            (platform) => platform.validDateCount === activeDates.length,
          ),
        );
      return {
        target,
        revisionPeriod: {
          start: revision.startAt,
          endExclusive: revision.endAt,
        },
        revisionDateCount: revisionDates.length,
        fullDateCoverage,
        platformConflicts,
        boardingConflicts,
        occurrences,
      };
    });
    return {
      providerId: pattern.id,
      sourceRecordSha256: entry.sourceRecordSha256,
      routeId: pattern.routeId,
      calendarId: pattern.calendarId,
      direction: pattern.direction,
      stopIds: pattern.stopIds,
      tripCount: pattern.tripIds.length,
      activeDates: {
        count: activeDates.length,
        first: activeDates[0] ?? null,
        last: activeDates.at(-1) ?? null,
      },
      pickupDropOff: restrictions,
      candidates,
    };
  });
  return {
    schemaVersion: 1,
    identity: report.identity,
    generationEligible: false as const,
    approval: 'agent-proposed; human review required',
    agencies: audit.agencies.map((agency) => ({
      providerId: agency.agency_id,
      referencedRouteIds: audit.routes
        .filter((route) => route.agency_id === agency.agency_id)
        .map((route) => route.route_id),
      suggestedDisposition: audit.routes.some(
        (route) => route.agency_id === agency.agency_id,
      )
        ? 'review operator alias'
        : 'ignore unused publisher only after review',
    })),
    ambiguousStops: report.entries.filter(
      (entry) => entry.kind === 'stop' && entry.candidates.length > 1,
    ),
    patterns,
  };
}
