import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  sourceReview,
  timetableStoreFixture,
} from './__tests__/timetableStoreFixture.js';
import { prepareScheduledTimetableArtifact } from './timetableArtifact.js';
import { selectRetainedScheduledTimetable } from './timetableSelection.js';
import { buildScheduleTopologyFingerprint } from './topology.js';

const roots: string[] = [];
afterEach(async () => {
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
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'timetable-selection-'));
  roots.push(root);
  const fixture = await timetableStoreFixture(root);
  const select = (serviceDate: string) =>
    selectRetainedScheduledTimetable({
      ...fixture.settings,
      serviceDate,
      scope,
    });
  return { ...fixture, select };
}

describe('retained timetable selection', () => {
  it('uses reviewed lineage and per-date coverage, falling back when a newer correction has a gap or damaged files', async () => {
    const { first, timetable, metadata, run, select, settings } =
      await fixture();
    await run(first, sourceReview('baseline', first));
    timetable.assignments[0].dateRanges = [
      { startDate: '2026-01-01', endDate: '2026-01-01' },
    ];
    const partial = prepareScheduledTimetableArtifact(timetable, {
      ...metadata,
      correctionRevision: 2,
    });
    await run(partial, sourceReview('correction', partial, first));
    const covered = await select('2026-01-01');
    expect(covered.selected?.manifestSha256).toBe(partial.manifestSha256);
    expect(
      covered.selected?.timetable.patterns[0].pattern.stops[0].platformIds,
    ).toEqual(['A', 'C']);
    const fallback = await select('2026-01-02');
    expect(fallback.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(fallback.attempts).toMatchObject([
      {
        manifestSha256: partial.manifestSha256,
        reason: 'mapping-coverage-gap',
        activeTripCount: 1,
        unassignedActiveTripCount: 1,
      },
      {
        manifestSha256: first.manifestSha256,
        reason: 'eligible',
        unassignedActiveTripCount: 0,
      },
    ]);
    const inactive = await select('2026-01-03');
    expect(inactive.selected?.manifestSha256).toBe(partial.manifestSha256);
    expect(inactive.attempts[0]).toMatchObject({
      reason: 'eligible',
      activeTripCount: 0,
    });
    await writeFile(
      join(settings.storeDir, partial.manifestSha256, 'NOTICE.txt'),
      'damaged',
    );
    const damaged = await select('2026-01-01');
    expect(damaged.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(damaged.attempts[0].reason).toBe('artifact-verification-failed');
  });

  it('keeps older eligible dates and topology available when a successor is for a later feed period or another canonical snapshot', async () => {
    const { first, timetable, metadata, run, select, settings } =
      await fixture();
    await run(first, sourceReview('baseline', first));
    const stationPath = join(settings.dataDir, 'station', 'S.json');
    const originalStation = await readFile(stationPath);
    const station = JSON.parse(originalStation.toString('utf8'));
    station.layout.platforms[0].label = 'Reviewed replacement label';
    await writeFile(stationPath, JSON.stringify(station));
    const later = structuredClone(timetable);
    later.timetable.calendars[0].exceptions = [
      { date: '2026-01-03', available: true },
      { date: '2026-01-04', available: true },
    ];
    later.assignments[0].dateRanges = [
      { startDate: '2026-01-03', endDate: '2026-01-04' },
    ];
    const future = prepareScheduledTimetableArtifact(later, {
      ...metadata,
      capture: { ...metadata.capture, sha256: 'b'.repeat(64) },
      feedRange: { startDate: '2026-01-03', endDate: '2026-01-07' },
      sourceFeedInfo: [
        { ...metadata.sourceFeedInfo[0], feed_start_date: '20260103' },
      ],
      identity: {
        ...metadata.identity,
        topology: await buildScheduleTopologyFingerprint(settings.dataDir),
      },
    });
    await run(future, sourceReview('resolve-version-conflict', future, first));
    expect((await select('2026-01-03')).selected?.manifestSha256).toBe(
      future.manifestSha256,
    );
    await writeFile(stationPath, originalStation);
    const earlierDate = await select('2026-01-02');
    expect(earlierDate.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(earlierDate.attempts[0].reason).toBe('outside-feed-range');
    const olderTopology = await select('2026-01-03');
    expect(olderTopology.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(olderTopology.attempts[0].reason).toBe('topology-mismatch');
    const singlePlatform = structuredClone(timetable);
    singlePlatform.patterns[0].pattern.stops[0].platformIds = ['A'];
    const latest = prepareScheduledTimetableArtifact(singlePlatform, {
      ...metadata,
      capture: { ...metadata.capture, sha256: 'c'.repeat(64) },
    });
    await run(latest, sourceReview('resolve-version-conflict', latest, future));
    const platformA = await selectRetainedScheduledTimetable({
      ...settings,
      serviceDate: '2026-01-01',
      scope: { ...scope, platformId: 'A' },
    });
    expect(platformA.selected?.manifestSha256).toBe(latest.manifestSha256);
    const platformC = await select('2026-01-01');
    expect(platformC.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(platformC.attempts[0].reason).toBe('scope-not-covered');
  });

  it('returns no eligible version for coverage, date or scope gaps and rejects invalid requests or broken review history', async () => {
    const { timetable, metadata, run, select, settings } = await fixture();
    expect(await select('2026-01-01')).toMatchObject({
      selected: null,
      attempts: [],
    });
    timetable.assignments[0].dateRanges = [
      { startDate: '2026-01-01', endDate: '2026-01-01' },
    ];
    const partial = prepareScheduledTimetableArtifact(timetable, metadata);
    await run(partial, sourceReview('baseline', partial));
    const gap = await select('2026-01-02');
    expect(gap.selected).toBeNull();
    expect(gap.attempts[0].reason).toBe('mapping-coverage-gap');
    expect((await select('2026-02-01')).attempts[0].reason).toBe(
      'outside-feed-range',
    );
    const reverse = await selectRetainedScheduledTimetable({
      ...settings,
      serviceDate: '2026-01-01',
      scope: {
        ...scope,
        stationId: 'D',
        destinationStationId: 'S',
        platformId: 'B',
      },
    });
    expect(reverse).toMatchObject({
      selected: null,
      attempts: [{ reason: 'scope-not-covered' }],
    });
    await expect(
      selectRetainedScheduledTimetable({
        ...settings,
        serviceDate: '2026-01-01',
        scope: { ...scope, platformId: 'unknown' },
      }),
    ).rejects.toThrow('platform does not belong');
    await expect(select('2026-02-30')).rejects.toThrow();
    const receiptPath = join(
      settings.storeDir,
      partial.manifestSha256,
      'import.json',
    );
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.sourceReview.successor.snapshotSha256 = 'f'.repeat(64);
    await writeFile(receiptPath, JSON.stringify(receipt));
    await expect(select('2026-01-01')).rejects.toThrow(
      'Invalid retained timetable source review',
    );
  });
});
