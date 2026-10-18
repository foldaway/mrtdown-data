import {
  ScheduledTripPatternDateScopeSchema,
  ScheduledTripPatternSchema,
} from '@mrtdown/core';
import z from 'zod';
import { matchServicePath } from './servicePath.js';
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
