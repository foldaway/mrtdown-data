import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ScheduledAssignedTimetable,
  Service,
  Station,
} from '@mrtdown/core';
import { afterEach, describe, expect, it } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import { verifyScheduledTimetableForCanonicalData } from './canonicalTimetableArtifact.js';
import {
  prepareScheduledTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from './timetableArtifact.js';
import { buildScheduleTopologyFingerprint } from './topology.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'canonical-timetable-'));
  roots.push(root);
  const { options } = await artifactFixture(root, true);
  const prepared = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    options,
  );
  const { timetable } = verifyScheduledTimetableArtifact(
    prepared.manifestBytes,
    prepared.manifestSha256,
    prepared,
  );
  const {
    timetable: _timetable,
    notice: _notice,
    ...metadata
  } = prepared.manifest;
  const verify = (
    bundle: ReturnType<typeof prepareScheduledTimetableArtifact> = prepared,
  ) =>
    verifyScheduledTimetableForCanonicalData(
      bundle.manifestBytes,
      bundle.manifestSha256,
      bundle,
      { dataDir: options.dataDir },
    );
  return { dataDir: options.dataDir, prepared, timetable, metadata, verify };
}

async function editRecord<T>(path: string, edit: (record: T) => void) {
  const record: T = JSON.parse(await readFile(path, 'utf8'));
  edit(record);
  await writeFile(path, JSON.stringify(record));
}

describe('timetable verification against installed canonical data', () => {
  it('preserves overnight times and grouped platforms while checking only active dates inside compact ranges', async () => {
    const { dataDir, timetable, metadata, verify } = await fixture();
    expect((await verify()).topology).toEqual(metadata.identity.topology);
    for (const id of ['S', 'D']) {
      await editRecord<Station>(
        join(dataDir, 'station', `${id}.json`),
        (station) => {
          const code = station.stationCodes[0];
          station.stationCodes = [
            { ...code, endedAt: '2026-01-02' },
            { ...code, startedAt: '2026-01-03' },
          ];
        },
      );
    }
    timetable.timetable.calendars[0] = {
      providerCalendarId: 'C',
      weekly: {
        startDate: '2026-01-01',
        endDate: '2026-01-03',
        weekdays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        },
      },
      exceptions: [{ date: '2026-01-02', available: false }],
    };
    timetable.assignments[0].dateRanges = [
      { startDate: '2026-01-01', endDate: '2026-01-03' },
    ];
    metadata.identity.topology = {
      ...(await buildScheduleTopologyFingerprint(dataDir)),
      projectionVersion: 1,
    };
    const compact = prepareScheduledTimetableArtifact(timetable, metadata);
    const result = await verify(compact);
    expect(result.timetable).toEqual(timetable);
    expect(result.timetable.timetable.trips[0]).toMatchObject({
      providerTripId: '0009007199254740993',
      stopTimes: [
        { stopSequence: '09007199254740992', departureSeconds: 90000 },
        { departureSeconds: 91800 },
      ],
    });
    expect(result.timetable.patterns[0].pattern.stops[0].platformIds).toEqual([
      'A',
      'C',
    ]);
  });

  it('rejects damaged downloads and invalid canonical references even when replacement bytes have trusted hashes', async () => {
    const { prepared, timetable, metadata, verify } = await fixture();
    await expect(
      verify({ ...prepared, timetableBytes: Buffer.from('{}') }),
    ).rejects.toThrow('size and SHA-256');
    const changes: [(value: ScheduledAssignedTimetable) => void, string][] = [
      [
        (value) => {
          value.patterns[0].pattern.lineId = 'missing';
        },
        'canonical line',
      ],
      [
        (value) => {
          value.patterns[0].pattern.serviceId = 'missing';
        },
        'canonical service',
      ],
      [
        (value) => {
          value.patterns[0].pattern.revisionId = 'missing';
        },
        'service revision',
      ],
      [
        (value) => {
          value.patterns[0].pattern.stops[0].platformIds = ['missing'];
        },
        'platform at station',
      ],
      [
        (value) => {
          const pattern = value.patterns[0].pattern;
          pattern.stops.reverse();
          pattern.destinationStationId = 'S';
        },
        'ordered path',
      ],
    ];
    for (const [edit, message] of changes) {
      const invalid = structuredClone(timetable);
      edit(invalid);
      await expect(
        verify(prepareScheduledTimetableArtifact(invalid, metadata)),
      ).rejects.toThrow(message);
    }
  });

  it('rejects stale topology and checks boarding, revision dates and assignment bounds after the fingerprint matches', async () => {
    const { dataDir, timetable, metadata, verify } = await fixture();
    const stationPath = join(dataDir, 'station', 'S.json');
    await editRecord<Station>(stationPath, (station) => {
      for (const platform of station.layout?.platforms ?? []) {
        platform.boardingStatus = 'not_in_service';
      }
    });
    await expect(verify()).rejects.toThrow('topology fingerprint');
    metadata.identity.topology = {
      ...(await buildScheduleTopologyFingerprint(dataDir)),
      projectionVersion: 1,
    };
    await expect(
      verify(prepareScheduledTimetableArtifact(timetable, metadata)),
    ).rejects.toThrow('boarding status');
    await editRecord<Station>(stationPath, (station) => {
      for (const platform of station.layout?.platforms ?? []) {
        delete platform.boardingStatus;
      }
    });
    const servicePath = join(dataDir, 'service', 'SVC.json');
    await editRecord<Service>(servicePath, (service) => {
      service.revisions[0].endAt = '2026-01-02';
    });
    metadata.identity.topology = {
      ...(await buildScheduleTopologyFingerprint(dataDir)),
      projectionVersion: 1,
    };
    await expect(
      verify(prepareScheduledTimetableArtifact(timetable, metadata)),
    ).rejects.toThrow('inactive on 2026-01-02');
    await editRecord<Service>(servicePath, (service) => {
      service.revisions[0].endAt = null;
    });
    metadata.identity.topology = {
      ...(await buildScheduleTopologyFingerprint(dataDir)),
      projectionVersion: 1,
    };
    const inactive = structuredClone(timetable);
    inactive.assignments[0].dateRanges[0].endDate = '2026-01-03';
    await expect(
      verify(prepareScheduledTimetableArtifact(inactive, metadata)),
    ).rejects.toThrow('endpoints must be active');
    const outside = structuredClone(timetable);
    outside.assignments[0].dateRanges[0].endDate = '2026-01-08';
    await expect(
      verify(prepareScheduledTimetableArtifact(outside, metadata)),
    ).rejects.toThrow('outside the declared feed range');
    expect((await verify()).timetable).toEqual(timetable);
  });
});
