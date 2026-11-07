import { hashBytes } from '../capture.js';
import { holidayFixture } from './holidayFixture.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing synthetic fixture record');
  return value;
}

/** A complete A/C group with a restricted C member and an opposite terminal default. */
export function platformAssociationFixture() {
  const {
    context,
    policy: holidayPolicy,
    calendar: holidayCalendar,
  } = holidayFixture();
  context.tables['routes.txt'] = context.tables['routes.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['trips.txt'] = context.tables['trips.txt'].filter(
    (row) => row.route_id === 'NEL_TEST',
  );
  context.tables['stop_times.txt'] = context.tables['stop_times.txt'].filter(
    (row) => row.trip_id.startsWith('NEL_TEST_'),
  );
  required(
    context.tables['stops.txt'].find((row) => row.stop_id === 'P'),
  ).platform_code = 'A / C';
  context.tables['stops.txt'].push({
    stop_id: 'P_SINGLE',
    stop_code: 'NE1',
    parent_station: 'S',
    platform_code: 'A',
    location_type: '0',
  });
  context.topology.services.push({
    id: 'REVERSE',
    lineId: 'NEL',
    revisions: [
      {
        id: 'RR',
        startAt: '2000-01-01',
        endAt: null,
        stations: [
          { stationId: 'D', displayCode: 'NE3' },
          { stationId: 'S', displayCode: 'NE1' },
        ],
      },
    ],
  });
  context.topology.lines[0].serviceIds.push('REVERSE');
  context.topology.stations[0].platforms.push({
    id: 'S_C',
    label: 'C',
    lineId: 'NEL',
    serviceIds: [],
    boardingStatus: 'not_in_service',
  });
  context.topology.stations[1].platforms[0].serviceIds = ['REVERSE'];
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  return {
    context,
    captureSha256: 'd'.repeat(64),
    holidayPolicy,
    holidayCalendar,
    allocationPolicy: {
      schemaVersion: 1,
      revision: 'baseline',
      sourceManifest: context.identity.sourceManifest,
      allocations: [
        {
          providerStopId: 'P_SINGLE',
          stationId: 'S',
          lineId: 'NEL',
          platformCode: 'A',
          serviceIds: ['REVERSE'],
          reason: 'Synthetic baseline rule',
        },
      ],
    },
    policy: {
      schemaVersion: 1,
      revision: 'review-v1',
      captureSha256: 'd'.repeat(64),
      sourceManifest: context.identity.sourceManifest,
      dateBasis: 'service-date',
      timezone: 'Asia/Singapore',
      serviceDateRange: {
        startDate: '2026-11-01',
        endDateExclusive: '2026-12-01',
      },
      basis: 'Synthetic maintainer assumption',
      groups: [
        {
          providerStopId: 'P',
          stationId: 'S',
          lineId: 'NEL',
          platformCode: 'A / C',
          reason:
            'Associate both distinct platforms; preserve their restrictions',
        },
      ],
      allocations: [
        {
          providerStopId: 'Q',
          stationId: 'D',
          lineId: 'NEL',
          platformCode: 'B',
          serviceIds: ['SVC'],
          reason: 'Synthetic source precedence at terminal',
        },
      ],
    },
  };
}
