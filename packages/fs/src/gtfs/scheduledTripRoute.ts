import { LineOperatorSchema } from '@mrtdown/core';
import z from 'zod';
import type { ScheduleTables } from './schedule.js';
import { validateScheduledTripPatternDateScope } from './scheduledTripPattern.js';
import type { scheduleTopologyProjection } from './topology.js';

export const ScheduledRouteMappingSchema = z
  .object({
    providerRouteId: z.string().min(1),
    lineId: z.string().min(1),
    providerAgencyId: z.string().min(1),
    operatorId: z.string().min(1),
  })
  .strict();

export type ScheduledRouteMapping = z.infer<typeof ScheduledRouteMappingSchema>;

const operatorPeriod = LineOperatorSchema.refine(
  ({ startedAt, endedAt }) =>
    startedAt === null || endedAt === null || endedAt > startedAt,
  { message: 'Line operator period end must follow its start' },
);

function uniqueRecord<T>(
  records: readonly T[],
  key: keyof T,
  id: string,
  kind: string,
) {
  const matches = records.filter((record) => record[key] === id);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${kind}: ${id}; found ${matches.length}`);
  }
  return matches[0];
}

export function validateScheduledTripPatternSourceRoute(
  input: unknown,
  tables: ScheduleTables,
  mappingInput: unknown,
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const mapping = ScheduledRouteMappingSchema.parse(mappingInput);
  const scope = validateScheduledTripPatternDateScope(input, topology);
  const trip = uniqueRecord(
    tables['trips.txt'] ?? [],
    'trip_id',
    scope.binding.providerTripId,
    'source trip',
  );
  if (trip.route_id !== mapping.providerRouteId) {
    throw new Error(
      `Source trip ${trip.trip_id} does not use route ${mapping.providerRouteId}`,
    );
  }
  const route = uniqueRecord(
    tables['routes.txt'] ?? [],
    'route_id',
    mapping.providerRouteId,
    'source route',
  );
  if (route.agency_id !== mapping.providerAgencyId) {
    throw new Error(
      `Source route ${route.route_id} does not use agency ${mapping.providerAgencyId}`,
    );
  }
  uniqueRecord(
    tables['agency.txt'] ?? [],
    'agency_id',
    mapping.providerAgencyId,
    'source agency',
  );
  if (mapping.lineId !== scope.binding.pattern.lineId) {
    throw new Error(
      `Source route mapping does not target pattern line ${scope.binding.pattern.lineId}`,
    );
  }
  uniqueRecord(
    topology.operators,
    'id',
    mapping.operatorId,
    'canonical operator',
  );
  const line = uniqueRecord(
    topology.lines,
    'id',
    mapping.lineId,
    'canonical line',
  );
  const periods = line.operators
    .filter((period) => period.operatorId === mapping.operatorId)
    .map((period) => operatorPeriod.parse(period));
  for (const date of scope.serviceDates) {
    if (
      !periods.some(
        ({ startedAt, endedAt }) =>
          (startedAt === null || date >= startedAt) &&
          (endedAt === null || date < endedAt),
      )
    ) {
      throw new Error(
        `Operator ${mapping.operatorId} does not cover line ${line.id} on ${date}`,
      );
    }
  }
  return scope;
}
