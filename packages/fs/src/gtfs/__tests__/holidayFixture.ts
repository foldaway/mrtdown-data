import { hashBytes } from '../capture.js';
import { scheduledHolidayCalendarSha256 } from '../scheduledHolidayPolicy.js';
import type { ScopedReviewContext } from '../scopedReviewContract.js';

export function holidayFixture() {
  const calendar = {
    id: 'SG-2026',
    countryCode: 'SG',
    schemaVersion: 1,
    revision: 'synthetic-2026-v1',
    checkedOn: '2026-11-03',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    source: {
      publisher: 'Synthetic test publisher',
      datasetId: 'test-holidays',
      datasetUrl: 'https://example.com/holidays',
      datasetUpdatedOn: '2026-01-01',
      retrievedUrl: 'https://example.com/holidays.csv',
      retrievedBytesSha256: 'a'.repeat(64),
      retrievedByteLength: 100,
      recordCount: 4,
      licenceUrl: 'https://example.com/licence',
      retrievedRecordCount: 4,
    },
    dates: [
      { date: '2026-01-01', name: 'Weekday holiday', observed: false },
      { date: '2026-03-21', name: 'Saturday holiday', observed: false },
      { date: '2026-11-08', name: 'Sunday holiday', observed: false },
      { date: '2026-11-09', name: 'Observed holiday', observed: true },
    ],
  };
  const context: ScopedReviewContext = {
    tables: {
      'agency.txt': [{ agency_id: 'SBST', agency_timezone: 'Asia/Singapore' }],
      'routes.txt': ['NEL_TEST', 'NSL_TEST'].map((route_id) => ({
        route_id,
        agency_id: 'SBST',
        route_type: '1',
      })),
      'stops.txt': [
        { stop_id: 'S', stop_code: 'NE1', location_type: '1' },
        {
          stop_id: 'P',
          stop_code: 'NE1',
          parent_station: 'S',
          platform_code: 'A',
          location_type: '0',
        },
        { stop_id: 'D', stop_code: 'NE3', location_type: '1' },
        {
          stop_id: 'Q',
          stop_code: 'NE3',
          parent_station: 'D',
          platform_code: 'B',
          location_type: '0',
        },
      ],
      'calendar.txt': ['WD', 'SA', 'SU'].map((service_id) => ({
        service_id,
        monday: service_id === 'WD' ? '1' : '0',
        tuesday: service_id === 'WD' ? '1' : '0',
        wednesday: service_id === 'WD' ? '1' : '0',
        thursday: service_id === 'WD' ? '1' : '0',
        friday: service_id === 'WD' ? '1' : '0',
        saturday: service_id === 'SA' ? '1' : '0',
        sunday: service_id === 'SU' ? '1' : '0',
        start_date: '20260101',
        end_date: '20261231',
      })),
      'trips.txt': ['NEL_TEST', 'NSL_TEST'].flatMap((route_id) =>
        ['WD', 'SA', 'SU'].map((service_id) => ({
          route_id,
          service_id,
          trip_id: `${route_id}_${service_id}`,
          direction_id: '0',
        })),
      ),
      'stop_times.txt': ['NEL_TEST', 'NSL_TEST'].flatMap((route) =>
        ['WD', 'SA', 'SU'].flatMap((calendarId) =>
          ['P', 'Q'].map((stop_id, index) => ({
            trip_id: `${route}_${calendarId}`,
            stop_id,
            stop_sequence: String(index + 1),
            arrival_time: index ? '25:02:00' : '25:00:00',
            departure_time: index ? '25:02:00' : '25:00:00',
          })),
        ),
      ),
    },
    topology: {
      projectionVersion: 1,
      operators: [{ id: 'SBS' }],
      lines: [
        {
          id: 'NEL',
          type: 'mrt',
          serviceIds: ['SVC'],
          operators: [
            { operatorId: 'SBS', startedAt: '2000-01-01', endedAt: null },
          ],
        },
      ],
      stations: ['S', 'D'].map((id, index) => ({
        id,
        stationCodes: [
          {
            lineId: 'NEL',
            code: index ? 'NE3' : 'NE1',
            startedAt: '2000-01-01',
            endedAt: null,
          },
        ],
        platforms: [
          {
            id: `platform-${id}`,
            label: index ? 'B' : 'A',
            lineId: 'NEL',
            serviceIds: ['SVC'],
            boardingStatus: null,
          },
        ],
      })),
      services: [
        {
          id: 'SVC',
          lineId: 'NEL',
          revisions: [
            {
              id: 'R',
              startAt: '2000-01-01',
              endAt: null,
              stations: [
                { stationId: 'S', displayCode: 'NE1' },
                { stationId: 'D', displayCode: 'NE3' },
              ],
            },
          ],
        },
      ],
    },
    identity: {
      sourceManifest: { 'calendar.txt': 'b'.repeat(64) },
      canonicalCommit: 'c'.repeat(40),
      topology: { projectionVersion: 1, sha256: '' },
    },
  };
  context.identity.topology.sha256 = hashBytes(
    Buffer.from(JSON.stringify(context.topology)),
  );
  const policy = {
    schemaVersion: 1,
    revision: 'synthetic-nel-v1',
    rule: 'sunday-on-public-holidays',
    sourceManifest: context.identity.sourceManifest,
    holidayCalendarSha256: scheduledHolidayCalendarSha256(calendar),
    families: [
      {
        lineId: 'NEL',
        providerRouteIds: ['NEL_TEST'],
        weekdayCalendarId: 'WD',
        saturdayCalendarId: 'SA',
        sundayCalendarId: 'SU',
      },
    ],
  };
  return { context, policy, calendar };
}
