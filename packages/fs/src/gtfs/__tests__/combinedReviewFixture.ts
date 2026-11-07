import { hashBytes } from '../capture.js';
import { groupedScopedReviewDraftSha256 } from '../groupedReviewContract.js';
import { auditSchedule } from '../schedule.js';
import { resolveScheduledHolidayDates } from '../scheduledHolidayPolicy.js';
import { createScheduledSourceJourneyMappingDraft } from '../scheduledSourceJourneys.js';
import { platformAssociationFixture } from './platformAssociationFixture.js';

/** Synthetic composition of a shared segment, restricted group and repeated source journey. */
export function combinedReviewFixture(
  sharedGroup = false,
  accessVariant = false,
) {
  const { policy: associationPolicy, ...base } = platformAssociationFixture();
  const { context } = base;
  context.tables['routes.txt'].push({
    route_id: 'NEL_SHARED',
    agency_id: 'SBST',
    route_type: '1',
  });
  base.holidayPolicy.families[0].providerRouteIds.push('NEL_SHARED');
  context.topology.stations.push({
    id: 'T',
    stationCodes: [
      { lineId: 'NEL', code: 'NE4', startedAt: '2000-01-01', endedAt: null },
    ],
    platforms: [
      {
        id: 'T_A',
        label: 'A',
        lineId: 'NEL',
        serviceIds: ['SHARED_A', 'SHARED_B'],
        boardingStatus: null,
      },
    ],
  });
  context.tables['stops.txt'].push(
    { stop_id: 'T', stop_code: 'NE4', location_type: '1' },
    {
      stop_id: 'R',
      stop_code: 'NE4',
      parent_station: 'T',
      platform_code: 'A',
      location_type: '0',
    },
  );
  context.topology.stations[0].platforms[0].serviceIds.push(
    'SHARED_A',
    'SHARED_B',
  );
  for (const id of ['SHARED_A', 'SHARED_B']) {
    context.topology.lines[0].serviceIds.push(id);
    context.topology.services.push({
      id,
      lineId: 'NEL',
      revisions: [
        {
          id: 'R',
          startAt: '2000-01-01',
          endAt: null,
          stations: [
            { stationId: 'S', displayCode: 'NE1' },
            { stationId: 'T', displayCode: 'NE4' },
          ],
        },
      ],
    });
  }
  for (const [trip_id, route_id, stops] of [
    ['UNUSUAL', 'NEL_TEST', ['P', 'Q', 'P', 'Q']],
    ['SHARED', 'NEL_SHARED', [sharedGroup ? 'P' : 'P_SINGLE', 'R']],
  ] as const) {
    context.tables['trips.txt'].push({
      trip_id,
      route_id,
      service_id: 'WD',
      direction_id: '0',
    });
    context.tables['stop_times.txt'].push(
      ...stops.map((stop_id, index) => ({
        trip_id,
        stop_id,
        stop_sequence: String(index + 1),
        arrival_time: `25:0${index}:00`,
        departure_time: `25:0${index}:00`,
      })),
    );
  }
  if (accessVariant) {
    const shared = context.tables['trips.txt'].find(
      (trip) => trip.trip_id === 'SHARED',
    );
    if (!shared) {
      throw new Error('Missing shared fixture trip');
    }
    context.tables['trips.txt'].push({
      ...shared,
      trip_id: 'SHARED_NO_PICKUP',
    });
    context.tables['stop_times.txt'].push(
      ...context.tables['stop_times.txt']
        .filter((row) => row.trip_id === 'SHARED')
        .map((row, index) => ({
          ...row,
          trip_id: 'SHARED_NO_PICKUP',
          stop_sequence: String(9007199254740993n + BigInt(index)),
          pickup_type: index ? '0' : '1',
          drop_off_type: index ? '2' : '0',
          timepoint: '0',
        })),
    );
  }
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const audit = auditSchedule(context.tables);
  const unusual = audit.patterns.find((pattern) =>
    pattern.tripIds.includes('UNUSUAL'),
  );
  const shared = audit.patterns.find((pattern) =>
    pattern.tripIds.includes('SHARED'),
  );
  if (!unusual || !shared) {
    throw new Error('Missing synthetic source pattern');
  }
  const population = resolveScheduledHolidayDates(
    context,
    base.holidayPolicy,
    base.holidayCalendar,
  );
  const dates = (id: string) =>
    population.patterns
      .find((pattern) => pattern.providerPatternId === id)
      ?.serviceDates.filter(
        (date) => date >= '2026-11-01' && date < '2026-12-01',
      ) ?? [];
  const sourceJourneyPolicy = {
    schemaVersion: 1,
    revision: 'synthetic-source-order',
    sourceManifest: context.identity.sourceManifest,
    passengerCallRule: 'timed-source-occurrences',
    journeys: [
      {
        providerPatternId: unusual.id,
        lineId: 'NEL',
        serviceId: 'SVC',
        serviceDates: dates(unusual.id),
        reason: 'Preserve the supplied reversal and repeated calls',
      },
    ],
  };
  const applicabilityPolicy = {
    schemaVersion: 1,
    revision: 'synthetic-november',
    captureSha256: base.captureSha256,
    sourceManifest: context.identity.sourceManifest,
    dateBasis: 'service-date',
    timezone: 'Asia/Singapore',
    serviceDateRange: { ...associationPolicy.serviceDateRange },
    basis: 'Explicit supported operations assumption',
  };
  const inputs = {
    ...base,
    associationPolicy,
    sourceJourneyPolicy,
    applicabilityPolicy,
  };
  const source = createScheduledSourceJourneyMappingDraft(
    context,
    sourceJourneyPolicy,
    base.allocationPolicy,
    base.holidayPolicy,
    base.holidayCalendar,
  );
  const sharedServiceMemberships = {
    schemaVersion: 1,
    documentKind: 'gtfs-shared-service-membership-claims',
    baseDraftSha256: groupedScopedReviewDraftSha256(source.mapping.mapping),
    claims: [
      {
        providerPatternId: shared.id,
        serviceDates: dates(shared.id),
        target: {
          kind: 'sharedServiceRevisions',
          members: ['SHARED_A', 'SHARED_B'].map((id) => ({
            kind: 'serviceRevision',
            id,
            revisionId: 'R',
            match: 'exact',
          })),
        },
        reason: 'Both services share the complete supplied segment',
      },
    ],
  };
  return {
    inputs,
    sharedServiceMemberships,
    unusualId: unusual.id,
    sharedId: shared.id,
  };
}
