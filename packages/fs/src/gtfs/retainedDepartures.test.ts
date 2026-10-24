import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import {
  sourceReview,
  timetableStoreFixture,
} from './__tests__/timetableStoreFixture.js';
import { queryRetainedScheduledDepartures } from './retainedDepartures.js';
import { readScheduledTimetableHistory } from './timetableStore.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

vi.mock('./timetableStore.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./timetableStore.js')>();
  return {
    ...original,
    readScheduledTimetableHistory: vi.fn(
      original.readScheduledTimetableHistory,
    ),
  };
});
const originalStore = await vi.importActual<
  typeof import('./timetableStore.js')
>('./timetableStore.js');
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(readScheduledTimetableHistory).mockImplementation(
    originalStore.readScheduledTimetableHistory,
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const scope = {
  stationId: 'S',
  lineId: 'NSL',
  serviceId: 'SVC',
  destinationStationId: 'D',
  platformId: 'C',
};
const window = {
  startInstant: '2026-01-02T00:30:00+08:00',
  endInstant: '2026-01-02T01:30:00+08:00',
};
async function fixture(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'retained-departures-'));
  roots.push(root);
  const fixture = await timetableStoreFixture(root, overrides);
  const query = (interval = window, limit?: number) =>
    queryRetainedScheduledDepartures({
      ...fixture.settings,
      scope,
      ...interval,
      limit,
    });
  return { ...fixture, query };
}

describe('retained scheduled departure queries', () => {
  it('merges independently selected service days before limiting results, preserving precision, occurrence identity and provenance', async () => {
    const { root, first, run, query } = await fixture();
    await run(first, sourceReview('baseline', first));
    const { options } = await artifactFixture(root, true, {
      'feed_info.txt':
        'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version\nSynthetic,https://example.test/,en,20260102,20260107,0.1\n',
      'calendar_dates.txt': 'service_id,date,exception_type\nC,20260102,1\n',
      'stop_times.txt':
        'trip_id,stop_id,stop_sequence,arrival_time,departure_time,timepoint,pickup_type\n0009007199254740993,P,09007199254740992,00:45:00,00:45:00,0,2\n0009007199254740993,Q,9007199254740993,01:15:00,01:15:00,1,0\n',
    });
    const current = await prepareVerifiedGtfsTimetableArtifact(
      join(root, 'schedule.zip'),
      join(root, 'capture.json'),
      options,
    );
    vi.mocked(readScheduledTimetableHistory).mockImplementationOnce(
      async (directory) => {
        const snapshot =
          await originalStore.readScheduledTimetableHistory(directory);
        await run(
          current,
          sourceReview('resolve-version-conflict', current, first),
        );
        return snapshot;
      },
    );
    const beforeImport = await query();
    expect(beforeImport.departures).toMatchObject([
      { manifestSha256: first.manifestSha256, serviceDate: '2026-01-01' },
    ]);
    expect(beforeImport.departures).toHaveLength(1);
    const result = await query();
    expect(result.complete).toBe(true);
    expect(
      result.serviceDays.map((day) => [day.serviceDate, day.manifestSha256]),
    ).toEqual([
      ['2026-01-01', first.manifestSha256],
      ['2026-01-02', current.manifestSha256],
    ]);
    expect(result.departures).toMatchObject([
      {
        departureInstant: '2026-01-01T16:45:00Z',
        serviceDate: '2026-01-02',
        manifestSha256: current.manifestSha256,
        snapshotSha256: current.manifest.capture.sha256,
        precision: 'approximate',
        timepoint: 0,
        pickupType: 2,
      },
      {
        departureInstant: '2026-01-01T17:00:00Z',
        serviceDate: '2026-01-01',
        manifestSha256: first.manifestSha256,
        precision: 'exact',
        timepoint: 1,
      },
    ]);
    for (const departure of result.departures) {
      expect(departure).toMatchObject({
        basis: 'scheduled',
        providerTripId: '0009007199254740993',
        stopSequence: '09007199254740992',
        platformIds: ['A', 'C'],
        stationId: 'S',
        destinationStationId: 'D',
        retrievedAt: '2026-01-15T00:00:00Z',
        correctionRevision: 1,
      });
    }
    expect((await query(window, 1)).departures).toEqual([result.departures[0]]);
    expect(
      (
        await query({
          startInstant: '2026-01-02T00:45:00+08:00',
          endInstant: '2026-01-02T01:00:00+08:00',
        })
      ).departures,
    ).toEqual([result.departures[0]]);
  });

  it('discovers trips beyond the previous day and applies each source calendar including removed and added dates', async () => {
    const { first, run, query } = await fixture({
      'calendar.txt':
        'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nC,1,1,1,1,1,0,0,20260101,20260103\n',
      'calendar_dates.txt':
        'service_id,date,exception_type\nC,20260102,2\nC,20260103,1\n',
      'stop_times.txt':
        'trip_id,stop_id,stop_sequence,arrival_time,departure_time\n0009007199254740993,P,09007199254740992,49:00:00,49:00:00\n0009007199254740993,Q,9007199254740993,49:30:00,49:30:00\n',
    });
    await run(first, sourceReview('baseline', first));
    const result = await query({
      startInstant: '2026-01-03T00:30:00+08:00',
      endInstant: '2026-01-03T01:30:00+08:00',
    });
    expect(result.complete).toBe(true);
    expect(result.serviceDays.map((day) => day.serviceDate)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(result.departures).toMatchObject([
      {
        serviceDate: '2026-01-01',
        departureSeconds: 176400,
        departureInstant: '2026-01-02T17:00:00Z',
      },
    ]);
    expect(result.departures).toHaveLength(1);
    expect(result.serviceDays[1].attempts.at(-1)).toMatchObject({
      reason: 'eligible',
      activeTripCount: 0,
    });
  });

  it('keeps boarding-only empty schedules distinct from unavailable coverage and rejects invalid query bounds', async () => {
    const { first, run, query, settings } = await fixture({
      'stop_times.txt':
        'trip_id,stop_id,stop_sequence,arrival_time,departure_time,pickup_type\n0009007199254740993,P,09007199254740992,25:00:00,25:00:00,1\n0009007199254740993,Q,9007199254740993,25:30:00,25:30:00,0\n',
    });
    expect(await query()).toMatchObject({ complete: false, departures: [] });
    const historical = await query({
      startInstant: '1932-12-31T23:45:00+07:00',
      endInstant: '1932-12-31T23:55:00+07:00',
    });
    expect(historical.serviceDays.map((day) => day.serviceDate)).toContain(
      '1933-01-01',
    );
    await run(first, sourceReview('baseline', first));
    expect(await query()).toMatchObject({
      complete: true,
      departures: [],
      unavailableArtifacts: [],
    });
    await writeFile(
      join(settings.storeDir, first.manifestSha256, 'NOTICE.txt'),
      'damaged',
    );
    const unavailable = await query();
    expect(unavailable).toMatchObject({
      complete: false,
      departures: [],
      unavailableArtifacts: [{ manifestSha256: first.manifestSha256 }],
    });
    expect(
      unavailable.serviceDays.every((day) => day.manifestSha256 === null),
    ).toBe(true);
    const untimed = await fixture({
      'stop_times.txt':
        'trip_id,stop_id,stop_sequence,arrival_time,departure_time,timepoint\n0009007199254740993,P,09007199254740992,25:00:00,,0\n0009007199254740993,Q,9007199254740993,25:30:00,25:30:00,1\n',
    });
    await untimed.run(untimed.first, sourceReview('baseline', untimed.first));
    expect(await untimed.query()).toMatchObject({
      complete: false,
      departures: [],
      untimedDepartureCount: 2,
    });
    await expect(query(window, 0)).rejects.toThrow();
    await expect(
      query({
        startInstant: window.endInstant,
        endInstant: window.startInstant,
      }),
    ).rejects.toThrow('end after');
    await expect(
      query({
        startInstant: window.startInstant,
        endInstant: '2026-01-03T01:30:00+08:00',
      }),
    ).rejects.toThrow('at most 24 hours');
  });
});
