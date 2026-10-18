import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashBytes } from '@mrtdown/fs';
import { strToU8, zipSync } from 'fflate';

export async function gtfsFixture(
  root: string,
  overrides: Record<string, string> = {},
) {
  const tables = {
    'agency.txt':
      'agency_id,agency_name,agency_url,agency_timezone\nA,Test,https://example.com,Asia/Singapore\n',
    'routes.txt': 'route_id,agency_id,route_type\nR,A,1\n',
    'stops.txt':
      'stop_id,stop_name,location_type,parent_station\nS,Station,1,\nP,Platform,0,S\nQ,Other platform,0,S\nUNUSED,Unused platform,0,S\nE,Entrance,2,S\n',
    'trips.txt': 'trip_id,route_id,service_id\n"T,late",R,C\ncurrent,R,C\n',
    'calendar_dates.txt':
      'service_id,date,exception_type\nC,20260101,1\nC,20260102,1\n',
    'stop_times.txt': [
      'trip_id,stop_id,stop_sequence,arrival_time,departure_time,pickup_type,timepoint',
      '"T,late",P,09007199254740992,25:00:00,25:00:00,1,1',
      '"T,late",P,9007199254740993,25:30:00,25:30:00,0,1',
      'current,P,1,0:30:00,0:30:00,0,0',
      'current,P,2,1:00:00,1:00:00,0,1',
      '',
    ].join('\n'),
    ...overrides,
  };
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries(tables).map(([name, text]) => [name, strToU8(text)]),
    ),
    { mtime: new Date(2000, 0, 1, 0, 0, 0) },
  );
  const capture = {
    schema_version: 1,
    capture_id: 'synthetic',
    feed_kind: 'schedule',
    source:
      'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
    retrieved_at: '2026-01-01T00:00:00Z',
    provider_timestamp: null,
    sha256: hashBytes(bytes),
    byte_length: bytes.length,
    archive_ref: 'synthetic/schedule.zip',
    attribution: 'Synthetic fixture',
    rights_status: 'pending_review',
    licence_reference: 'https://example.com/terms',
  };
  await writeFile(join(root, 'schedule.zip'), bytes);
  await writeFile(join(root, 'capture.json'), JSON.stringify(capture));
  return capture;
}
