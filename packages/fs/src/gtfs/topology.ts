import type { Line, Operator, Service, Station } from '@mrtdown/core';
import { listEntities } from '../entities.js';
import { hashBytes } from './capture.js';
import { compareStrings } from './order.js';

function sorted<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) =>
    compareStrings(JSON.stringify(a), JSON.stringify(b)),
  );
}

export function scheduleTopologyProjection(input: {
  operators: Operator[];
  lines: Line[];
  stations: Station[];
  services: Service[];
}) {
  return {
    projectionVersion: 1,
    operators: sorted(input.operators.map(({ id }) => ({ id }))),
    lines: sorted(
      input.lines.map(({ id, type, serviceIds, operators }) => ({
        id,
        type,
        serviceIds: [...serviceIds].sort(),
        operators: sorted(
          operators.map(({ operatorId, startedAt, endedAt }) => ({
            operatorId,
            startedAt,
            endedAt,
          })),
        ),
      })),
    ),
    stations: sorted(
      input.stations.map(({ id, stationCodes, layout }) => ({
        id,
        stationCodes: sorted(
          stationCodes.map(({ lineId, code, startedAt, endedAt }) => ({
            lineId,
            code,
            startedAt,
            endedAt,
          })),
        ),
        platforms: sorted(
          (layout?.platforms ?? []).map(
            ({ id, label, lineId, serviceIds, boardingStatus }) => ({
              id,
              label,
              lineId,
              serviceIds: [...(serviceIds ?? [])].sort(),
              boardingStatus: boardingStatus ?? null,
            }),
          ),
        ),
      })),
    ),
    services: sorted(
      input.services.map(({ id, lineId, revisions }) => ({
        id,
        lineId,
        revisions: sorted(
          revisions.map(({ id, startAt, endAt, path }) => ({
            id,
            startAt,
            endAt,
            stations: path.stations.map(({ stationId, displayCode }) => ({
              stationId,
              displayCode,
            })),
          })),
        ),
      })),
    ),
  };
}

export async function readScheduleTopology(dataDir: string) {
  const [operators, lines, stations, services] = await Promise.all([
    listEntities(dataDir, 'operator'),
    listEntities(dataDir, 'line'),
    listEntities(dataDir, 'station'),
    listEntities(dataDir, 'service'),
  ]);
  if (
    !operators.length ||
    !lines.length ||
    !stations.length ||
    !services.length
  ) {
    throw new Error(
      'Canonical topology requires operators, lines, stations and services',
    );
  }
  return scheduleTopologyProjection({
    operators: operators.map((record) => record.value),
    lines: lines.map((record) => record.value),
    stations: stations.map((record) => record.value),
    services: services.map((record) => record.value),
  });
}

export async function buildScheduleTopologyFingerprint(dataDir: string) {
  const projection = await readScheduleTopology(dataDir);
  return {
    projectionVersion: projection.projectionVersion,
    sha256: hashBytes(Buffer.from(JSON.stringify(projection))),
  };
}
