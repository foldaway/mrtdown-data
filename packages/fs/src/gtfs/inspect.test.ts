import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import GtfsRealtime from 'gtfs-realtime-bindings';
import { describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { inspectGtfsCapture } from './inspect.js';
import { auditSchedule, gtfsTimeSeconds, readSchedule } from './schedule.js';

function scheduleFixture(overrides: Record<string, string> = {}) {
  const tables = {
    'agency.txt':
      'agency_id,agency_name,agency_url,agency_timezone\nSMRT,"Test, trains",https://example.com,Asia/Singapore\n',
    'routes.txt': 'route_id,agency_id,route_type\nEWL,SMRT,1\n',
    'stops.txt':
      'stop_id,stop_name,location_type,parent_station,stop_code\nS,Station,1,,EW1\nP,Platform,0,S,\n',
    'trips.txt': 'route_id,service_id,trip_id,direction_id\nEWL,C,T,0\n',
    'stop_times.txt':
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint\nT,24:10:00,24:11:00,P,1,1,0,0\nT,24:20:00,24:20:00,P,2,0,1,1\n',
    'calendar.txt':
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC,1,1,1,1,1,1,1,20260101,20261231\n',
    ...overrides,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(tables).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
}

async function inspect(
  bytes: Uint8Array,
  kind: 'schedule' | 'service_alerts' | 'trip_updates',
  override = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'mrtdown-gtfs-'));
  try {
    const file = join(dir, 'input');
    const handoff = join(dir, 'capture.json');
    const endpoint = {
      schedule: 'GTFSScheduleTrain',
      service_alerts: 'GTFSRealTimeTrainServiceAlerts',
      trip_updates: 'GTFSRealtimeTrainTripUpdates',
    }[kind];
    await writeFile(file, bytes);
    await writeFile(
      handoff,
      JSON.stringify({
        schema_version: 1,
        capture_id: 'synthetic',
        feed_kind: kind,
        source: `https://datamall2.mytransport.sg/ltaodataservice/${endpoint}`,
        retrieved_at: '2026-10-12T12:00:00Z',
        provider_timestamp: null,
        sha256: hashBytes(bytes),
        byte_length: bytes.length,
        archive_ref: 'synthetic/input',
        attribution: 'Synthetic fixture',
        rights_status: 'pending_review',
        licence_reference: 'https://example.com/terms',
        ...override,
      }),
    );
    return await inspectGtfsCapture(file, handoff);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('offline GTFS inspection', () => {
  it('produces deterministic schedule reports preserving quoted CSV and repeated stop occurrences', async () => {
    const first = await inspect(scheduleFixture(), 'schedule');
    expect(first).toEqual(await inspect(scheduleFixture(), 'schedule'));
    if (!first.schedule) throw new Error('Expected schedule');
    expect(first.schedule.structuralErrors).toEqual([]);
    expect(first.schedule.agencies[0]?.agency_name).toBe('Test, trains');
    expect(first.schedule.patterns[0]?.stopIds).toEqual(['P', 'P']);
    const { tables } = readSchedule(scheduleFixture());
    expect(tables['stop_times.txt']?.[0]?.pickup_type).toBe('1');
    expect(tables['stop_times.txt']?.[0]?.timepoint).toBe('0');
  });
  it('rejects mismatched bytes and mismatched feed source', async () => {
    await expect(
      inspect(scheduleFixture(), 'schedule', { sha256: '0'.repeat(64) }),
    ).rejects.toThrow('SHA-256');
    await expect(
      inspect(scheduleFixture(), 'schedule', { source: 'https://example.com' }),
    ).rejects.toThrow('feed kind');
  });
  it('reports unresolved references independently of any canonical mapping', () => {
    const { tables } = readSchedule(
      scheduleFixture({
        'trips.txt': 'route_id,service_id,trip_id\nUNKNOWN,UNKNOWN,T\n',
      }),
    );
    expect(auditSchedule(tables).structuralErrors).toContain(
      'trip T: unknown route UNKNOWN',
    );
    expect(auditSchedule(tables).structuralErrors).toContain(
      'trip T: unknown calendar UNKNOWN',
    );
  });
  it('sorts stop times by GTFS sequence rather than requiring CSV file order', () => {
    const { tables } = readSchedule(scheduleFixture());
    tables['stop_times.txt']?.reverse();
    expect(auditSchedule(tables).structuralErrors).toEqual([]);
    const row = tables['stop_times.txt']?.[0];
    if (row) row.stop_sequence = '1';
    expect(auditSchedule(tables).structuralErrors).toContain(
      'trip T: duplicate stop sequence 1',
    );
  });
  it('rejects malformed CSV, missing tables, and unsafe ZIP member layouts', () => {
    expect(() =>
      readSchedule(scheduleFixture({ 'stops.txt': 'stop_id,stop_id\nA,B\n' })),
    ).toThrow('duplicate CSV');
    expect(() =>
      readSchedule(
        zipSync({ 'stops.txt': strToU8('stop_id,stop_name\nA,A\n') }),
      ),
    ).toThrow('Missing required');
    expect(() =>
      readSchedule(zipSync({ '../stops.txt': strToU8('x') })),
    ).toThrow('root-level');
  });
  it('extracts realtime provider time and accepts a valid zero-entity capture', async () => {
    const bytes = GtfsRealtime.transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: '2.0', timestamp: 100 },
      entity: [],
    }).finish();
    const report = await inspect(bytes, 'trip_updates');
    if (!report.realtime) throw new Error('Expected realtime');
    expect(report.realtime.providerTimestampSeconds).toBe('100');
    expect(report.realtime.entityCount).toBe(0);
    expect(report.capture.provider_timestamp).toBeNull();
  });
  it('preserves whitespace headers, open periods and source text without interpreting prose dates', async () => {
    const bytes = GtfsRealtime.transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: '2.0' },
      entity: [
        {
          id: 'a',
          alert: {
            activePeriod: [{ start: 100 }],
            informedEntity: [{ routeId: 'DTL' }],
            headerText: { translation: [{ text: '  ' }] },
            descriptionText: {
              translation: [{ text: 'Adjustment ends tomorrow' }],
            },
          },
        },
      ],
    }).finish();
    const report = await inspect(bytes, 'service_alerts');
    if (!report.realtime) throw new Error('Expected realtime');
    expect(report.realtime.providerTimestampSeconds).toBeNull();
    expect(report.realtime.entities[0].alert.activePeriod).toEqual([
      { start: '100' },
    ]);
    expect(
      report.realtime.entities[0].alert.headerText.translation[0].text,
    ).toBe('  ');
  });
  it('rejects differential feeds and wrong realtime entity kinds', async () => {
    const { FeedMessage } = GtfsRealtime.transit_realtime;
    await expect(
      inspect(
        FeedMessage.encode({
          header: { gtfsRealtimeVersion: '2.0', incrementality: 1 },
        }).finish(),
        'trip_updates',
      ),
    ).rejects.toThrow('DIFFERENTIAL');
    await expect(
      inspect(
        FeedMessage.encode({
          header: { gtfsRealtimeVersion: '2.0' },
          entity: [{ id: 'a', alert: {} }],
        }).finish(),
        'trip_updates',
      ),
    ).rejects.toThrow('unexpected entity');
    await expect(inspect(new Uint8Array(), 'trip_updates')).rejects.toThrow();
  });
});

// GTFS Time accepts H:MM:SS as well as HH:MM:SS, including hours after midnight.
it.each([
  ['6:21:30', 22890],
  ['06:21:30', 22890],
  ['0:00:00', 0],
  ['24:10:00', 87000],
])('parses valid GTFS time %s', (value, seconds) => {
  expect(gtfsTimeSeconds(value)).toBe(seconds);
});

it.each([
  '6:60:00',
  '6:21:60',
  '6:1:30',
  '-1:00:00',
])('rejects invalid GTFS time %s', (value) => {
  expect(gtfsTimeSeconds(value)).toBeNull();
});

it('audits single-digit-hour arrival and departure times without false errors', () => {
  const { tables } = readSchedule(
    scheduleFixture({
      'stop_times.txt':
        'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT,6:21:30,6:21:30,P,1\nT,6:23:10,6:23:10,P,2\n',
    }),
  );
  expect(auditSchedule(tables).structuralErrors).toEqual([]);
});
