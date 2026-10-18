import { ScheduledTripPatternSchema } from '@mrtdown/core';
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
