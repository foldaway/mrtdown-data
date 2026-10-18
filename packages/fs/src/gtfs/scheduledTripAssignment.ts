import {
  ScheduledTripPatternDateScopeSchema,
  scheduledTripWithPatternOnDate,
} from '@mrtdown/core';
import z from 'zod';
import type { ScheduleTables } from './schedule.js';
import { scheduledTimetableFromGtfs } from './scheduledTimetable.js';
import {
  validateScheduledTripPatternBoarding,
  validateScheduledTripPatternSourceStops,
} from './scheduledTripPattern.js';
import {
  ScheduledRouteMappingSchema,
  validateScheduledTripPatternSourceRoute,
} from './scheduledTripRoute.js';
import type { scheduleTopologyProjection } from './topology.js';

export const ScheduledTripPatternAssignmentSchema = z
  .object({
    scope: ScheduledTripPatternDateScopeSchema,
    routeMapping: ScheduledRouteMappingSchema,
  })
  .strict();

export type ScheduledTripPatternAssignment = z.infer<
  typeof ScheduledTripPatternAssignmentSchema
>;

export function validateScheduledTripPatternAssignments(
  tables: ScheduleTables,
  assignmentsInput: unknown,
  topology: ReturnType<typeof scheduleTopologyProjection>,
) {
  const assignments = z
    .array(ScheduledTripPatternAssignmentSchema)
    .parse(assignmentsInput);
  const timetable = scheduledTimetableFromGtfs(tables);
  const trips = new Map(
    timetable.trips.map((trip) => [trip.providerTripId, trip]),
  );
  const calendars = new Map(
    timetable.calendars.map((calendar) => [
      calendar.providerCalendarId,
      calendar,
    ]),
  );
  const byTrip = new Map<string, ScheduledTripPatternAssignment[]>();
  for (const assignment of assignments) {
    const id = assignment.scope.binding.providerTripId;
    const group = byTrip.get(id) ?? [];
    group.push(assignment);
    byTrip.set(id, group);
  }
  for (const [id, group] of byTrip) {
    const trip = trips.get(id);
    if (!trip) {
      throw new Error(`Missing source trip for assignments: ${id}`);
    }
    const calendar = calendars.get(trip.providerCalendarId);
    if (!calendar) {
      throw new Error(`Missing source calendar: ${trip.providerCalendarId}`);
    }
    const scopes = group.map(({ scope }) => scope);
    // The resolver checks every scope and overlap, including dates not selected here.
    scheduledTripWithPatternOnDate(
      trip,
      calendar,
      scopes,
      scopes[0].serviceDates[0],
    );
    for (const { scope, routeMapping } of group) {
      validateScheduledTripPatternSourceStops(
        scope,
        tables['stops.txt'] ?? [],
        topology,
      );
      validateScheduledTripPatternBoarding(trip, scope.binding, topology);
      validateScheduledTripPatternSourceRoute(
        scope,
        tables,
        routeMapping,
        topology,
      );
    }
  }
  return assignments;
}
