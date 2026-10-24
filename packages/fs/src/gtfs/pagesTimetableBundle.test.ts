import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewedReleaseFixture } from './__tests__/releaseFixture.js';
import { hashBytes } from './capture.js';
import { readScheduledTimetablePagesBundle } from './pagesTimetableBundle.js';
import { queryRetainedScheduledDepartures } from './retainedDepartures.js';
import { exportGtfsTimetableRelease } from './timetableExport.js';
import { importScheduledTimetableArtifact } from './timetableStore.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(grouped = false) {
  const root = await mkdtemp(join(tmpdir(), 'pages-timetable-'));
  roots.push(root);
  const options = await reviewedReleaseFixture(root, grouped);
  const directory = join(root, 'bundle');
  const result = await exportGtfsTimetableRelease(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    directory,
    options,
  );
  const files = unzipSync(
    zipSync(
      Object.fromEntries(
        await Promise.all(
          (await readdir(directory)).map(async (name) => [
            `scheduled-timetable/${name}`,
            await readFile(join(directory, name)),
          ]),
        ),
      ),
    ),
  );
  const manifest = JSON.parse(
    new TextDecoder().decode(files['scheduled-timetable/manifest.json']),
  );
  const entry = {
    manifestSha256: result.manifestSha256,
    releaseSha256: hashBytes(files['scheduled-timetable/release.json']),
    capture: manifest.capture,
    feedRange: manifest.feedRange,
    currentLicenceReference: manifest.currentLicenceReference,
    coverage: {
      sourceTripDateCount: result.coverage.sourceTripDateCount,
      assignedTripDateCount: result.coverage.assignedTripDateCount,
      missingTripDateCount: result.coverage.missingTripDateCount,
    },
  };
  const read = (path: string) => {
    if (!files[path]) {
      throw new Error(`Missing archive entry: ${path}`);
    }
    return files[path];
  };
  return { root, options, files, entry, read };
}

describe('Pages timetable bundle consumer', () => {
  it('reads both released mapping formats from an archive and supplies bytes for canonical import and overnight departures', async () => {
    for (const grouped of [false, true]) {
      const { root, options, entry, read } = await fixture(grouped);
      const bundle = await readScheduledTimetablePagesBundle(entry, read);
      expect(bundle).not.toBeNull();
      if (!bundle) {
        throw new Error('Missing synthetic bundle');
      }
      expect(bundle.releaseReview).toEqual(options.releaseReview);
      expect(bundle.mappingApproval).toEqual(options.mappingApproval);
      const storeDir = join(root, 'store');
      await mkdir(storeDir);
      const imported = await importScheduledTimetableArtifact(
        bundle,
        entry.manifestSha256,
        {
          storeDir,
          dataDir: options.dataDir,
          importInstant: options.releaseInstant,
          sourceReview: {
            schemaVersion: 1,
            documentKind: 'scheduled-timetable-source-review',
            decision: 'baseline',
            predecessor: null,
            successor: {
              manifestSha256: entry.manifestSha256,
              snapshotSha256: bundle.manifest.capture.sha256,
            },
            reviewer: 'Synthetic importer reviewer',
            reviewedAt: options.releaseInstant,
            reason: 'Synthetic baseline; no real source approved.',
          },
        },
      );
      expect(imported.imported).toBe(true);
      const departures = await queryRetainedScheduledDepartures({
        storeDir,
        dataDir: options.dataDir,
        scope: {
          stationId: 'S',
          lineId: 'NSL',
          serviceId: 'SVC',
          destinationStationId: 'D',
          platformId: grouped ? 'C' : 'A',
        },
        startInstant: '2026-01-02T00:30:00+08:00',
        endInstant: '2026-01-02T01:30:00+08:00',
      });
      expect(departures.complete).toBe(true);
      expect(departures.departures).toMatchObject([
        {
          basis: 'scheduled',
          precision: 'exact',
          serviceDate: '2026-01-01',
          departureInstant: '2026-01-01T17:00:00Z',
          manifestSha256: entry.manifestSha256,
        },
      ]);
      expect(departures.departures).toHaveLength(1);
    }
  });

  it('ignores an absent optional timetable and rejects missing or damaged advertised files', async () => {
    const unusedRead = vi.fn();
    expect(
      await readScheduledTimetablePagesBundle(undefined, unusedRead),
    ).toBeNull();
    expect(unusedRead).not.toHaveBeenCalled();
    const { entry, files, read } = await fixture(true);
    for (const path of Object.keys(files)) {
      const original = files[path];
      delete files[path];
      await expect(
        readScheduledTimetablePagesBundle(entry, read),
      ).rejects.toThrow();
      files[path] = new Uint8Array([0xff]);
      await expect(
        readScheduledTimetablePagesBundle(entry, read),
      ).rejects.toThrow();
      files[path] = original;
    }
    await expect(
      readScheduledTimetablePagesBundle(
        {
          ...entry,
          coverage: {
            sourceTripDateCount: 3,
            assignedTripDateCount: 3,
            missingTripDateCount: 0,
          },
        },
        read,
      ),
    ).rejects.toThrow('coverage');
    await expect(
      readScheduledTimetablePagesBundle(
        {
          ...entry,
          capture: {
            ...entry.capture,
            attribution: 'Different attribution',
          },
        },
        read,
      ),
    ).rejects.toThrow('capture');
  });

  it('rejects blocked publication and unbound or mistimed reviews even when the report digest is trusted', async () => {
    const { entry, files, read } = await fixture();
    const reportPath = 'scheduled-timetable/release.json';
    const report = JSON.parse(new TextDecoder().decode(files[reportPath]));
    for (const patch of [
      { eligible: false },
      { blockers: ['Mapping review is not complete'] },
      { mappingApprovalSha256: 'a'.repeat(64) },
      { reviewSha256: 'b'.repeat(64) },
      { releaseInstant: '2026-01-15T00:00:00Z' },
    ]) {
      files[reportPath] = Buffer.from(
        JSON.stringify({
          ...report,
          release: { ...report.release, ...patch },
        }),
      );
      await expect(
        readScheduledTimetablePagesBundle(
          {
            ...entry,
            releaseSha256: hashBytes(files[reportPath]),
          },
          read,
        ),
      ).rejects.toThrow();
    }
  });
});
