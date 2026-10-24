import {
  isScheduledServiceDate,
  type ScheduledAssignedTimetable,
} from '@mrtdown/core';
import z from 'zod';
import { hashBytes } from './capture.js';
import {
  type RetainedScheduledTimetable,
  readRetainedScheduledTimetable,
  readScheduledTimetableHistory,
} from './timetableStore.js';
import { readScheduleTopology } from './topology.js';

export const ScheduledTimetableRequestScopeSchema = z
  .object({
    stationId: z.string().min(1),
    lineId: z.string().min(1),
    serviceId: z.string().min(1),
    destinationStationId: z.string().min(1),
    platformId: z.string().min(1).optional(),
  })
  .strict();
export type ScheduledTimetableRequestScope = z.infer<
  typeof ScheduledTimetableRequestScopeSchema
>;

type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;
function validateScope(
  scope: ScheduledTimetableRequestScope,
  topology: Topology,
) {
  const line = topology.lines.find((item) => item.id === scope.lineId);
  const service = topology.services.find((item) => item.id === scope.serviceId);
  const station = topology.stations.find((item) => item.id === scope.stationId);
  const destination = topology.stations.find(
    (item) => item.id === scope.destinationStationId,
  );
  if (!line || !service || !station || !destination) {
    throw new Error(
      'Timetable request references an unknown canonical station, line or service',
    );
  }
  if (service.lineId !== line.id || !line.serviceIds.includes(service.id)) {
    throw new Error('Timetable request service does not belong to its line');
  }
  if (
    !service.revisions.some(
      (revision) =>
        revision.stations.some((stop) => stop.stationId === station.id) &&
        revision.stations.some((stop) => stop.stationId === destination.id),
    )
  ) {
    throw new Error('Timetable request stations do not belong to its service');
  }
  if (scope.platformId !== undefined) {
    const platforms = station.platforms.filter(
      (platform) => platform.id === scope.platformId,
    );
    if (
      platforms.length !== 1 ||
      platforms[0].lineId !== line.id ||
      (platforms[0].serviceIds.length &&
        !platforms[0].serviceIds.includes(service.id))
    ) {
      throw new Error(
        'Timetable request platform does not belong to its station, line and service',
      );
    }
  }
}

function dateCoverage(
  timetable: ScheduledAssignedTimetable,
  serviceDate: string,
) {
  const activeCalendars = new Set(
    timetable.timetable.calendars
      .filter((calendar) => isScheduledServiceDate(calendar, serviceDate))
      .map((calendar) => calendar.providerCalendarId),
  );
  const assigned = new Set(
    timetable.assignments
      .filter((assignment) =>
        assignment.dateRanges.some(
          (range) =>
            serviceDate >= range.startDate && serviceDate <= range.endDate,
        ),
      )
      .map((assignment) => assignment.providerTripId),
  );
  let activeTripCount = 0;
  let unassignedActiveTripCount = 0;
  for (const trip of timetable.timetable.trips) {
    if (activeCalendars.has(trip.providerCalendarId)) {
      activeTripCount++;
      if (!assigned.has(trip.providerTripId)) {
        unassignedActiveTripCount++;
      }
    }
  }
  return { activeTripCount, unassignedActiveTripCount };
}

function scopePatternIds(
  timetable: ScheduledAssignedTimetable,
  scope: ScheduledTimetableRequestScope,
  serviceDate: string,
  topology: Topology,
) {
  const service = topology.services.find((item) => item.id === scope.serviceId);
  const revisions = new Set(
    service?.revisions
      .filter(
        (revision) =>
          serviceDate >= revision.startAt &&
          (revision.endAt === null || serviceDate < revision.endAt),
      )
      .map((revision) => revision.id),
  );
  const usedPatterns = new Set(
    timetable.assignments.map((assignment) => assignment.patternId),
  );
  return timetable.patterns
    .filter(
      ({ id, pattern }) =>
        usedPatterns.has(id) &&
        pattern.lineId === scope.lineId &&
        pattern.serviceId === scope.serviceId &&
        pattern.destinationStationId === scope.destinationStationId &&
        revisions.has(pattern.revisionId) &&
        pattern.stops.some(
          (stop, index) =>
            index < pattern.stops.length - 1 &&
            stop.stationId === scope.stationId &&
            (scope.platformId === undefined ||
              stop.platformIds.includes(scope.platformId)),
        ),
    )
    .map(({ id }) => id);
}

export interface ScheduledTimetableSelectionAttempt {
  manifestSha256: string;
  reason:
    | 'outside-feed-range'
    | 'topology-mismatch'
    | 'artifact-verification-failed'
    | 'scope-not-covered'
    | 'mapping-coverage-gap'
    | 'eligible';
  detail?: string;
  activeTripCount?: number;
  unassignedActiveTripCount?: number;
}

type SelectionOptions = {
  storeDir: string;
  dataDir: string;
  serviceDate: string;
  scope: ScheduledTimetableRequestScope;
};

/** Canonical data and the private store must remain stable apart from atomic appends. */
export async function selectRetainedScheduledTimetable(
  options: SelectionOptions,
) {
  const input = structuredClone(options);
  const history = await readScheduledTimetableHistory(input.storeDir);
  return selectFromRetainedTimetableHistory(input, history);
}

/** Internal composition for a window query's already validated history snapshot. */
export async function selectFromRetainedTimetableHistory(
  options: SelectionOptions,
  history: readonly RetainedScheduledTimetable[],
) {
  const { storeDir, dataDir } = options;
  const serviceDate = z.iso.date().parse(options.serviceDate);
  const scope = ScheduledTimetableRequestScopeSchema.parse(options.scope);
  const topology = await readScheduleTopology(dataDir);
  validateScope(scope, topology);
  const fingerprint = hashBytes(Buffer.from(JSON.stringify(topology)));
  const attempts: ScheduledTimetableSelectionAttempt[] = [];
  for (const version of [...history].reverse()) {
    const { manifest, manifestSha256 } = version;
    if (
      serviceDate < manifest.feedRange.startDate ||
      serviceDate > manifest.feedRange.endDate
    ) {
      attempts.push({ manifestSha256, reason: 'outside-feed-range' });
      continue;
    }
    if (
      manifest.identity.topology.sha256 !== fingerprint ||
      manifest.identity.topology.projectionVersion !==
        topology.projectionVersion
    ) {
      attempts.push({ manifestSha256, reason: 'topology-mismatch' });
      continue;
    }
    let retained: Awaited<ReturnType<typeof readRetainedScheduledTimetable>>;
    try {
      retained = await readRetainedScheduledTimetable(
        storeDir,
        manifestSha256,
        { dataDir },
      );
    } catch (error) {
      attempts.push({
        manifestSha256,
        reason: 'artifact-verification-failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const patternIds = scopePatternIds(
      retained.timetable,
      scope,
      serviceDate,
      topology,
    );
    if (!patternIds.length) {
      attempts.push({ manifestSha256, reason: 'scope-not-covered' });
      continue;
    }
    const coverage = dateCoverage(retained.timetable, serviceDate);
    if (coverage.unassignedActiveTripCount) {
      attempts.push({
        manifestSha256,
        reason: 'mapping-coverage-gap',
        ...coverage,
      });
      continue;
    }
    attempts.push({ manifestSha256, reason: 'eligible', ...coverage });
    return { serviceDate, scope, selected: retained, patternIds, attempts };
  }
  return { serviceDate, scope, selected: null, patternIds: [], attempts };
}
