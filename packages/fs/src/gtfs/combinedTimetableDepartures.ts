import { scheduledServiceDayInstant } from '@mrtdown/core';
import z from 'zod';
import type { CombinedTimetableArtifactSchema } from './combinedTimetableArtifact.js';

type Artifact = z.infer<typeof CombinedTimetableArtifactSchema>;

/** Project one service date from a verified artifact using its effective date sets. */
export function projectCombinedTimetableServiceDay(
  artifact: Artifact,
  date: string,
) {
  const serviceDate = z.iso.date().parse(date);
  const { startDate, endDateExclusive } =
    artifact.applicabilityPolicy.serviceDateRange;
  if (serviceDate < startDate || serviceDate >= endDateExclusive) return null;

  const unassigned = new Set<string>();
  for (const gap of artifact.coverage.gaps) {
    if (gap.serviceDates.includes(serviceDate)) {
      for (const tripId of gap.providerTripIds) unassigned.add(tripId);
    }
  }
  const assigned = new Set<string>();
  const trips = new Map(
    artifact.trips.map((trip) => [trip.providerTripId, trip]),
  );
  const active: {
    trip: Artifact['trips'][number];
    pattern: Artifact['patterns'][string];
  }[] = [];
  for (const row of artifact.assignments) {
    if (!artifact.dateSets[row.dateSetId].includes(serviceDate)) continue;
    if (
      assigned.has(row.providerTripId) ||
      unassigned.has(row.providerTripId)
    ) {
      throw new Error(
        `Overlapping combined timetable coverage: ${row.providerTripId}:${serviceDate}`,
      );
    }
    assigned.add(row.providerTripId);
    const trip = trips.get(row.providerTripId);
    const pattern = artifact.patterns[row.patternId];
    if (
      !trip ||
      !pattern ||
      trip.providerRouteId !== pattern.routeMapping.providerRouteId ||
      trip.stopTimes.length !== pattern.calls.length
    ) {
      throw new Error(
        `Combined timetable pattern does not match trip ${row.providerTripId}`,
      );
    }
    active.push({ trip, pattern });
  }

  function* departures() {
    const instant = (seconds: number | null) =>
      seconds === null
        ? null
        : scheduledServiceDayInstant(serviceDate, seconds);
    for (const { trip, pattern } of active) {
      for (const [occurrenceIndex, call] of pattern.calls.entries()) {
        const boardingByService = pattern.serviceMemberships.flatMap(
          (member) => {
            const platformIds = call.platforms
              .filter((platform) =>
                platform.accessByService.some(
                  (access) =>
                    access.serviceId === member.serviceId &&
                    access.revisionId === member.revisionId &&
                    access.passengerBoardingEligible,
                ),
              )
              .map((platform) => platform.platformId);
            return platformIds.length ? [{ ...member, platformIds }] : [];
          },
        );
        if (!boardingByService.length) continue;
        const time = trip.stopTimes[occurrenceIndex];
        yield {
          ...time,
          providerRouteId: trip.providerRouteId,
          providerCalendarId: trip.providerCalendarId,
          serviceDate,
          occurrenceIndex,
          stationId: call.stationId,
          lineId: pattern.lineId,
          destinationStationId: pattern.destinationStationId,
          platformSemantics: call.platformSemantics,
          boardingByService,
          arrivalInstant: instant(time.arrivalSeconds),
          departureInstant: instant(time.departureSeconds),
        };
      }
    }
  }

  return {
    serviceDate,
    activeTripCount: assigned.size + unassigned.size,
    unassignedActiveTripCount: unassigned.size,
    departures: departures(),
  };
}
