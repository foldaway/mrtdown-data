import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { hashBytes } from '../capture.js';
import { readSchedule } from '../schedule.js';
import {
  createGroupedScopedReconciliationDraft,
  createScopedReconciliationDraft,
} from '../scopedReviewDraft.js';
import { readScheduleTopology } from '../topology.js';

export async function artifactFixture(
  root: string,
  grouped = false,
  overrides: Record<string, string> = {},
) {
  const tables = {
    'agency.txt':
      'agency_id,agency_name,agency_url,agency_timezone\nSMRT,Synthetic,https://example.test/,Asia/Singapore\n',
    'routes.txt': 'route_id,agency_id,route_type\nNSL_TEST,SMRT,1\n',
    'stops.txt': `stop_id,stop_name,stop_code,location_type,parent_station,platform_code\nS,S,NS1,1,,\nP,P,NS1,0,S,${grouped ? 'A/C' : 'A'}\nD,D,NS2,1,,\nQ,Q,NS2,0,D,B\n`,
    'trips.txt':
      'trip_id,route_id,service_id\n0009007199254740993,NSL_TEST,C\n',
    'stop_times.txt':
      'trip_id,stop_id,stop_sequence,arrival_time,departure_time\n0009007199254740993,P,09007199254740992,25:00:00,25:00:00\n0009007199254740993,Q,9007199254740993,25:30:00,25:30:00\n',
    'calendar_dates.txt':
      'service_id,date,exception_type\nC,20260101,1\nC,20260102,1\n',
    'feed_info.txt':
      'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\nSynthetic,https://example.test/,en,20260101,20260107,0.1\n',
    ...overrides,
  };
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(tables).map(([name, text]) => [name, strToU8(text)]),
    ),
    { mtime: new Date('2000-01-01T00:00:00Z') },
  );
  const capture = {
    schema_version: 1,
    capture_id: 'synthetic',
    feed_kind: 'schedule',
    source:
      'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
    retrieved_at: '2026-01-15T00:00:00Z',
    provider_timestamp: null,
    sha256: hashBytes(bytes),
    byte_length: bytes.length,
    archive_ref: 'synthetic/schedule.zip',
    attribution: 'Synthetic attribution',
    rights_status: 'pending_review',
    licence_reference: 'https://example.test/original-terms',
  };
  await writeFile(join(root, 'schedule.zip'), bytes);
  await writeFile(join(root, 'capture.json'), JSON.stringify(capture));
  const name = { 'en-SG': 'Synthetic', 'zh-Hans': null, ms: null, ta: null };
  const records = [
    [
      'operator',
      { id: 'SMRT_TRAINS', name, foundedAt: '2000-01-01', url: null },
    ],
    [
      'line',
      {
        id: 'NSL',
        name,
        type: 'mrt.high',
        color: '#000000',
        startedAt: null,
        platformDoorCount: 24,
        trainCarCounts: [1],
        serviceIds: ['SVC'],
        operators: [
          { operatorId: 'SMRT_TRAINS', startedAt: null, endedAt: null },
        ],
      },
    ],
    [
      'service',
      {
        id: 'SVC',
        name,
        lineId: 'NSL',
        revisions: [
          {
            id: 'r1',
            startAt: '2000-01-01',
            endAt: null,
            path: {
              stations: [
                { stationId: 'S', displayCode: 'NS1' },
                { stationId: 'D', displayCode: 'NS2' },
              ],
            },
            operatingHours: {
              weekdays: { start: '05:00', end: '01:00' },
              weekends: { start: '05:00', end: '01:00' },
            },
          },
        ],
      },
    ],
    ...['S', 'D'].map((id, index) => [
      'station',
      {
        id,
        name,
        geo: { latitude: 0, longitude: 0 },
        townId: 'T',
        landmarkIds: [],
        stationCodes: [
          {
            lineId: 'NSL',
            code: `NS${index + 1}`,
            startedAt: '2000-01-01',
            endedAt: null,
            structureType: 'at_grade',
          },
        ],
        layout: {
          platforms: (index ? ['B'] : grouped ? ['A', 'C'] : ['A']).map(
            (id) => ({
              id,
              label: id,
              lineId: 'NSL',
              lastUpdated: '2026-01-01',
            }),
          ),
        },
      },
    ]),
  ] as [string, { id: string }][];
  for (const [kind, record] of records) {
    await mkdir(join(root, 'data', kind), { recursive: true });
    await writeFile(
      join(root, 'data', kind, `${record.id}.json`),
      JSON.stringify(record),
    );
  }
  const { tables: parsed, manifest } = readSchedule(bytes);
  const topology = await readScheduleTopology(join(root, 'data'));
  const identity = {
    sourceManifest: manifest,
    canonicalCommit: 'a'.repeat(40),
    topology: {
      projectionVersion: 1,
      sha256: hashBytes(Buffer.from(JSON.stringify(topology))),
    },
  };
  const draft = (
    grouped
      ? createGroupedScopedReconciliationDraft
      : createScopedReconciliationDraft
  )(
    { tables: parsed, topology, identity },
    { pilotLineIds: ['NSL'], preparedBy: 'Synthetic proposal' },
  );
  return {
    capture,
    identity,
    options: {
      dataDir: join(root, 'data'),
      canonicalCommit: identity.canonicalCommit,
      draft,
      mappingVersion: 'synthetic-v1',
      correctionRevision: 1,
      currentLicenceReference: 'https://example.test/current-terms',
    },
  };
}
