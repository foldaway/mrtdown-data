import z from 'zod';
import { ScheduledTripAssignmentDocumentSchema } from './assignmentCapture.js';
import { GroupedScopedReconciliationDraftSchema } from './groupedReviewContract.js';
import { compareStrings } from './order.js';
import { auditSchedule } from './schedule.js';
import {
  type ScheduledTripPatternAssignment,
  validateScheduledTripPatternAssignments,
} from './scheduledTripAssignment.js';
import { scheduledTripTimesFromGtfs } from './scheduledTripTimes.js';
import {
  evaluateGroupedScopedReconciliation,
  evaluateScopedReconciliation,
} from './scopedReview.js';
import {
  key,
  ScopedReconciliationDraftSchema,
  type ScopedReviewContext,
  scopedReviewDraftFingerprint,
} from './scopedReviewContract.js';

/** Expand matched cells for compatibility checks; unresolved coverage remains unassigned. */
export function createScheduledTripAssignmentProposals(
  context: ScopedReviewContext,
  draftInput: unknown,
  approvalInput?: unknown,
) {
  const draft = z
    .union([
      ScopedReconciliationDraftSchema,
      GroupedScopedReconciliationDraftSchema,
    ])
    .parse(draftInput);
  const review =
    draft.schemaVersion === 3
      ? evaluateGroupedScopedReconciliation(context, draft, approvalInput)
      : evaluateScopedReconciliation(context, draft, approvalInput);
  if (!review.valid) {
    throw new Error(`Invalid mapping draft: ${review.errors.join('; ')}`);
  }
  const patterns = new Map(
    auditSchedule(context.tables).patterns.map((pattern) => [
      pattern.id,
      pattern,
    ]),
  );
  const trips = new Map(
    scheduledTripTimesFromGtfs(context.tables).map((trip) => [
      trip.providerTripId,
      trip,
    ]),
  );
  const routes = new Map(
    (context.tables['routes.txt'] ?? []).map((row) => [row.route_id, row]),
  );
  const targets = new Map(
    draft.decisions
      .filter(
        (item) => item.kind !== 'pattern' && item.disposition === 'matched',
      )
      .map((item) => [key(item), item.target]),
  );
  const dateSets = new Map(
    draft.dateSets.map((set) => [set.id, set.serviceDates]),
  );
  const assignments: ScheduledTripPatternAssignment[] = [];
  for (const decision of draft.decisions) {
    if (decision.kind !== 'pattern' || decision.disposition !== 'matched') {
      continue;
    }
    const source = patterns.get(decision.providerId);
    const target = decision.target;
    const serviceDates = dateSets.get(decision.dateSetId);
    if (
      !source ||
      target?.kind !== 'serviceRevision' ||
      !target.revisionId ||
      !serviceDates
    ) {
      throw new Error(`Missing matched pattern inputs: ${decision.providerId}`);
    }
    const routeTarget = targets.get(`route:${source.routeId}`);
    const agencyId = routes.get(source.routeId)?.agency_id;
    const agencyTarget = targets.get(`agency:${agencyId}`);
    if (
      routeTarget?.kind !== 'line' ||
      !agencyId ||
      agencyTarget?.kind !== 'operator'
    ) {
      throw new Error(`Missing matched route or agency: ${source.routeId}`);
    }
    const stops = source.stopIds.map((id) => {
      const stop = targets.get(`stop:${id}`);
      if (
        !stop?.stationId ||
        (stop.kind !== 'platform' && stop.kind !== 'platformGroup')
      ) {
        throw new Error(`Missing matched platform: ${id}`);
      }
      return {
        stationId: stop.stationId,
        platformIds:
          stop.kind === 'platformGroup' ? stop.platformIds : [stop.id],
      };
    });
    const destination = stops.at(-1);
    if (!destination) {
      throw new Error(`Missing destination: ${decision.providerId}`);
    }
    for (const tripId of source.tripIds) {
      const trip = trips.get(tripId);
      if (!trip) {
        throw new Error(`Missing source trip: ${tripId}`);
      }
      assignments.push({
        scope: {
          serviceDates,
          binding: {
            providerTripId: tripId,
            pattern: {
              lineId: routeTarget.id,
              serviceId: target.id,
              revisionId: target.revisionId,
              destinationStationId: destination.stationId,
              stops,
            },
            occurrences: trip.stopTimes.map(
              ({ providerStopId, stopSequence }) => ({
                providerStopId,
                stopSequence,
              }),
            ),
          },
        },
        routeMapping: {
          providerRouteId: source.routeId,
          lineId: routeTarget.id,
          providerAgencyId: agencyId,
          operatorId: agencyTarget.id,
        },
      });
    }
  }
  const validated = validateScheduledTripPatternAssignments(
    context.tables,
    assignments,
    context.topology,
  );
  validated.sort(
    (a, b) =>
      compareStrings(
        a.scope.binding.providerTripId,
        b.scope.binding.providerTripId,
      ) || compareStrings(a.scope.serviceDates[0], b.scope.serviceDates[0]),
  );
  return {
    draftSha256: scopedReviewDraftFingerprint(draft),
    review,
    document: ScheduledTripAssignmentDocumentSchema.parse({
      schemaVersion: 1,
      documentKind: 'gtfs-trip-assignments',
      identity: context.identity,
      assignments: validated,
    }),
    generationEligible: false as const,
  };
}
