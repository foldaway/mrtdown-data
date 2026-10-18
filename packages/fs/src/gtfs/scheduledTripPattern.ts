import {
  bindScheduledTripPattern,
  ScheduledTripPatternBindingSchema,
  ScheduledTripPatternDateScopeSchema,
  ScheduledTripPatternSchema,
} from '@mrtdown/core';
import z from 'zod';
import type { CsvRow } from './schedule.js';
import { matchServicePath } from './servicePath.js';
import { resolveStationCandidates } from './stationMatch.js';
import type { scheduleTopologyProjection } from './topology.js';

function uniqueReference<T extends { id: string }>(
  records: readonly T[],
  id: string,
  kind: string,
): T {
  const matches = records.filter((record) => record.id === id);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one canonical ${kind}: ${id}; found ${matches.length}`,
    );
  }
  return matches[0];
}

/** Check reference integrity only; source matching, effective dates and approval are separate. */
export function validateScheduledTripPatternReferences(
  input: unknown,
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const pattern = ScheduledTripPatternSchema.parse(input);
  const line = uniqueReference(topology.lines, pattern.lineId, 'line');
  const service = uniqueReference(
    topology.services,
    pattern.serviceId,
    'service',
  );
  if (service.lineId !== line.id || !line.serviceIds.includes(service.id)) {
    throw new Error(
      `Canonical service ${service.id} does not belong to line ${line.id}`,
    );
  }
  const revision = uniqueReference(
    service.revisions,
    pattern.revisionId,
    'service revision',
  );
  const revisionStations = new Set(
    revision.stations.map((stop) => stop.stationId),
  );
  for (const [index, stop] of pattern.stops.entries()) {
    const station = uniqueReference(
      topology.stations,
      stop.stationId,
      'station',
    );
    if (!revisionStations.has(station.id)) {
      throw new Error(
        `Stop ${index}: station ${station.id} is outside service revision ${revision.id}`,
      );
    }
    for (const id of stop.platformIds) {
      const platform = uniqueReference(
        station.platforms,
        id,
        `platform at station ${station.id}`,
      );
      if (platform.lineId !== line.id) {
        throw new Error(
          `Stop ${index}: platform ${id} is outside line ${line.id}`,
        );
      }
      if (
        platform.serviceIds.length &&
        !platform.serviceIds.includes(service.id)
      ) {
        throw new Error(
          `Stop ${index}: platform ${id} excludes service ${service.id}`,
        );
      }
    }
  }
  return pattern;
}

const canonicalPeriod = z
  .object({ start: z.iso.date(), end: z.iso.date().nullable() })
  .refine(({ start, end }) => end === null || end > start, {
    message: 'Canonical period end must follow its start',
  });

function effective(date: string, period: z.infer<typeof canonicalPeriod>) {
  return date >= period.start && (period.end === null || date < period.end);
}

export function validateScheduledTripPatternDateScope(
  input: unknown,
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const scope = ScheduledTripPatternDateScopeSchema.parse(input);
  const pattern = validateScheduledTripPatternReferences(
    scope.binding.pattern,
    topology,
  );
  const service = uniqueReference(
    topology.services,
    pattern.serviceId,
    'service',
  );
  const revision = uniqueReference(
    service.revisions,
    pattern.revisionId,
    'service revision',
  );
  const path = matchServicePath(
    revision.stations,
    pattern.stops.map((stop) => stop.stationId),
  );
  if (!path) {
    throw new Error(
      `Pattern is outside the ordered path of service revision ${service.id}/${revision.id}`,
    );
  }
  const revisionPeriod = canonicalPeriod.parse({
    start: revision.startAt,
    end: revision.endAt,
  });
  // Keep each complete alignment together; different paths cannot lend each other code evidence.
  const segments = path.segments.map((segment) =>
    segment.map(({ stationId, displayCode }) => {
      const station = uniqueReference(topology.stations, stationId, 'station');
      return station.stationCodes
        .filter(
          (code) => code.lineId === pattern.lineId && code.code === displayCode,
        )
        .map((code) =>
          canonicalPeriod.parse({ start: code.startedAt, end: code.endedAt }),
        );
    }),
  );
  for (const date of scope.serviceDates) {
    if (!effective(date, revisionPeriod)) {
      throw new Error(
        `Service revision ${service.id}/${revision.id} is inactive on ${date}`,
      );
    }
    const supported = segments.some((segment) =>
      segment.every((periods) =>
        periods.some((period) => effective(date, period)),
      ),
    );
    if (!supported) {
      throw new Error(
        `No complete path of service revision ${service.id}/${revision.id} has active station codes on ${date}`,
      );
    }
  }
  return scope;
}

export function validateScheduledTripPatternBoarding(
  tripInput: unknown,
  bindingInput: unknown,
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const binding = ScheduledTripPatternBindingSchema.parse(bindingInput);
  validateScheduledTripPatternReferences(binding.pattern, topology);
  const trip = bindScheduledTripPattern(tripInput, binding);
  for (const [index, stop] of trip.stopTimes.entries()) {
    const station = uniqueReference(
      topology.stations,
      stop.stationId,
      'station',
    );
    for (const id of stop.platformIds) {
      const platform = uniqueReference(
        station.platforms,
        id,
        `platform at station ${station.id}`,
      );
      if (
        platform.boardingStatus === 'not_in_service' ||
        (platform.boardingStatus === 'alighting_only' &&
          index < trip.stopTimes.length - 1 &&
          stop.pickupType !== 1)
      ) {
        throw new Error(
          `Trip ${trip.providerTripId}: occurrence ${index} conflicts with platform ${id} boarding status ${platform.boardingStatus}`,
        );
      }
    }
  }
  return trip;
}

function requireSourceStop(rows: readonly CsvRow[], id: string) {
  const matches = rows.filter((row) => row.stop_id === id);
  if (matches.length !== 1) {
    throw new Error(`Expected one source stop: ${id}; found ${matches.length}`);
  }
  return matches[0];
}

function validateSourceStationCode(
  code: string,
  stationId: string,
  dates: readonly string[],
  topology: ReturnType<typeof scheduleTopologyProjection>,
  lineId?: string,
) {
  const candidates = topology.stations.map((station) => ({
    id: station.id,
    periods: station.stationCodes
      .filter(
        (item) => item.code === code && (!lineId || item.lineId === lineId),
      )
      .map((item) =>
        canonicalPeriod.parse({ start: item.startedAt, end: item.endedAt }),
      ),
  }));
  for (const date of dates) {
    const active = candidates.filter((candidate) =>
      candidate.periods.some((period) => effective(date, period)),
    );
    if (active.length !== 1 || active[0].id !== stationId) {
      throw new Error(
        `Source station code ${code} does not uniquely identify ${stationId} on ${date}`,
      );
    }
  }
}

/** Check supplied stop correspondence; literal trip binding and approval remain separate. */
export function validateScheduledTripPatternSourceStops(
  input: unknown,
  sourceStops: readonly CsvRow[],
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const scope = validateScheduledTripPatternDateScope(input, topology);
  const { pattern, occurrences } = scope.binding;
  for (const [index, occurrence] of occurrences.entries()) {
    const source = requireSourceStop(sourceStops, occurrence.providerStopId);
    if (
      (source.location_type && source.location_type !== '0') ||
      !source.stop_code
    ) {
      throw new Error(
        `Source stop ${source.stop_id} requires a platform and station code`,
      );
    }
    const stop = pattern.stops[index];
    validateSourceStationCode(
      source.stop_code,
      stop.stationId,
      scope.serviceDates,
      topology,
      pattern.lineId,
    );
    if (source.parent_station) {
      const parent = requireSourceStop(sourceStops, source.parent_station);
      if (parent.location_type !== '1' || parent.parent_station) {
        throw new Error(`Source parent ${parent.stop_id} must be a station`);
      }
      // A snapshot's interchange parent identifies the station, not dated service on that code's line.
      const candidates = resolveStationCandidates(
        parent,
        undefined,
        topology.stations,
      );
      if (
        candidates.length !== 1 ||
        candidates[0].station.id !== stop.stationId
      ) {
        throw new Error(
          `Source parent ${parent.stop_id} does not uniquely identify ${stop.stationId}`,
        );
      }
    }
    const labels = (source.platform_code ?? '')
      .split('/')
      .map((label) => label.trim());
    if (
      labels.some((label) => !label) ||
      new Set(labels).size !== labels.length
    ) {
      throw new Error(
        `Source stop ${source.stop_id} requires distinct nonempty platform labels`,
      );
    }
    const station = uniqueReference(
      topology.stations,
      stop.stationId,
      'station',
    );
    const platformIds = labels
      .map((label) => {
        const matches = station.platforms.filter(
          (platform) =>
            platform.lineId === pattern.lineId && platform.label === label,
        );
        if (matches.length !== 1) {
          throw new Error(
            `Source stop ${source.stop_id}: expected one platform for label ${label}; found ${matches.length}`,
          );
        }
        return matches[0].id;
      })
      .sort();
    if (
      platformIds.length !== stop.platformIds.length ||
      platformIds.some((id, index) => id !== stop.platformIds[index])
    ) {
      throw new Error(
        `Source stop ${source.stop_id} does not match the complete canonical platform set`,
      );
    }
  }
  return scope;
}
