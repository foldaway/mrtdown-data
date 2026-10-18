import { compareStrings } from './order.js';
import { activeServiceDates } from './reconciliationEvidence.js';
import type { ScheduleTables } from './schedule.js';
import type { ScheduledTripPatternAssignment } from './scheduledTripAssignment.js';

/** Inputs have passed combined validation against these same source tables. */
export function scheduledTripAssignmentCoverage(
  tables: ScheduleTables,
  assignments: readonly ScheduledTripPatternAssignment[],
) {
  const assignedByTrip = new Map<string, Set<string>>();
  for (const { scope } of assignments) {
    const id = scope.binding.providerTripId;
    const dates = assignedByTrip.get(id) ?? new Set<string>();
    for (const date of scope.serviceDates) {
      dates.add(date);
    }
    assignedByTrip.set(id, dates);
  }
  const datesByCalendar = new Map<string, string[]>();
  const gaps = new Map<
    string,
    {
      providerCalendarId: string;
      providerTripIds: string[];
      serviceDates: string[];
    }
  >();
  const trips = [...(tables['trips.txt'] ?? [])].sort((a, b) =>
    compareStrings(a.trip_id, b.trip_id),
  );
  let sourceTripDateCount = 0;
  let inactiveTripCount = 0;
  for (const trip of trips) {
    let dates = datesByCalendar.get(trip.service_id);
    if (!dates) {
      dates = activeServiceDates(tables, trip.service_id);
      datesByCalendar.set(trip.service_id, dates);
    }
    sourceTripDateCount += dates.length;
    if (!dates.length) {
      inactiveTripCount++;
    }
    const assigned = assignedByTrip.get(trip.trip_id);
    const missing = dates.filter((date) => !assigned?.has(date));
    if (missing.length) {
      const key = JSON.stringify([trip.service_id, missing]);
      const gap = gaps.get(key) ?? {
        providerCalendarId: trip.service_id,
        providerTripIds: [],
        serviceDates: missing,
      };
      gap.providerTripIds.push(trip.trip_id);
      gaps.set(key, gap);
    }
  }
  const orderedGaps = [...gaps]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([, gap]) => gap);
  const missingTripDateCount = orderedGaps.reduce(
    (count, gap) =>
      count + gap.providerTripIds.length * gap.serviceDates.length,
    0,
  );
  return {
    sourceTripCount: trips.length,
    inactiveTripCount,
    sourceTripDateCount,
    assignedTripDateCount: sourceTripDateCount - missingTripDateCount,
    missingTripDateCount,
    tripDateCoverageComplete: missingTripDateCount === 0,
    gaps: orderedGaps,
  };
}
