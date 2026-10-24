import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  sourceReview,
  timetableStoreFixture,
} from './__tests__/timetableStoreFixture.js';
import { queryRetainedScheduledDepartures } from './retainedDepartures.js';
import { prepareScheduledTimetableArtifact } from './timetableArtifact.js';
import type { ScheduledTimetableRollbackReview } from './timetableRollback.js';
import { selectRetainedScheduledTimetable } from './timetableSelection.js';
import { readScheduledTimetableHistory } from './timetableStore.js';

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
  const root = await mkdtemp(join(tmpdir(), 'timetable-rollback-'));
  roots.push(root);
  const fixture = await timetableStoreFixture(root);
  await fixture.run(fixture.first, sourceReview('baseline', fixture.first));
  await fixture.run(
    fixture.successor,
    sourceReview('resolve-version-conflict', fixture.successor, fixture.first),
  );
  const review: ScheduledTimetableRollbackReview = {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-rollback-review',
    from: {
      manifestSha256: fixture.successor.manifestSha256,
      snapshotSha256: fixture.successor.manifest.capture.sha256,
    },
    to: {
      manifestSha256: fixture.first.manifestSha256,
      snapshotSha256: fixture.first.manifest.capture.sha256,
    },
    dateRange: { startDate: '2026-01-01', endDate: '2026-01-01' },
    scope,
    reviewer: 'Synthetic rollback reviewer',
    reviewedAt: '2026-01-20T01:00:00Z',
    reason: 'Synthetic scoped rollback; no real review is supplied.',
  };
  const rollback = { review, selectionInstant: '2026-01-21T00:00:00Z' };
  const select = (
    input = rollback,
    requestedScope = scope,
    serviceDate = '2026-01-01',
  ) =>
    selectRetainedScheduledTimetable({
      ...fixture.settings,
      scope: requestedScope,
      serviceDate,
      rollback: input,
    });
  return { ...fixture, review, rollback, select };
}

describe('scoped timetable rollback', () => {
  it('changes only the reviewed date and exact scope, preserving the retained lineage and exposing its audit record in window queries', async () => {
    const { first, successor, settings, select, rollback } = await fixture();
    const historyBefore = await readScheduledTimetableHistory(
      settings.storeDir,
    );
    const selected = await select();
    expect(selected.selected?.manifestSha256).toBe(first.manifestSha256);
    expect(selected.rollback).toEqual({
      ...rollback,
      status: 'applied',
      blockers: [],
    });
    expect(
      (await select(rollback, scope, '2026-01-02')).selected?.manifestSha256,
    ).toBe(successor.manifestSha256);
    const otherPlatform = await select(rollback, { ...scope, platformId: 'A' });
    expect(otherPlatform.selected?.manifestSha256).toBe(
      successor.manifestSha256,
    );
    expect(otherPlatform.rollback?.status).toBe('not-applicable');
    const allPlatforms = await selectRetainedScheduledTimetable({
      ...settings,
      serviceDate: '2026-01-01',
      scope: {
        stationId: 'S',
        lineId: 'NSL',
        serviceId: 'SVC',
        destinationStationId: 'D',
      },
      rollback,
    });
    expect(allPlatforms.selected?.manifestSha256).toBe(
      successor.manifestSha256,
    );
    expect(allPlatforms.rollback?.status).toBe('not-applicable');
    const departures = await queryRetainedScheduledDepartures({
      ...settings,
      scope,
      rollback,
      startInstant: '2026-01-02T00:30:00+08:00',
      endInstant: '2026-01-02T01:30:00+08:00',
    });
    expect(departures.complete).toBe(true);
    expect(departures.serviceDays).toMatchObject([
      {
        serviceDate: '2026-01-01',
        manifestSha256: first.manifestSha256,
        rollback: { status: 'applied' },
      },
      {
        serviceDate: '2026-01-02',
        manifestSha256: successor.manifestSha256,
        rollback: { status: 'not-applicable' },
      },
    ]);
    expect(departures.departures).toMatchObject([
      {
        manifestSha256: first.manifestSha256,
        snapshotSha256: first.manifest.capture.sha256,
        correctionRevision: 1,
        precision: 'exact',
      },
    ]);
    expect(await readScheduledTimetableHistory(settings.storeDir)).toEqual(
      historyBefore,
    );
    const normal = await selectRetainedScheduledTimetable({
      ...settings,
      scope,
      serviceDate: '2026-01-01',
    });
    expect(normal.selected?.manifestSha256).toBe(successor.manifestSha256);
    expect(normal.rollback).toBeNull();
  });

  it('rejects unbound, forward, stale or mistimed overrides without silently selecting another version', async () => {
    const { successor, rollback, select, settings, run, timetable, metadata } =
      await fixture();
    for (const patch of [
      { to: { ...rollback.review.to, snapshotSha256: 'f'.repeat(64) } },
      { to: { ...rollback.review.to, manifestSha256: 'f'.repeat(64) } },
      { from: rollback.review.to, to: rollback.review.from },
      { to: rollback.review.from },
      { reviewedAt: '2026-01-19T00:00:00Z' },
      { reviewedAt: '2026-01-22T00:00:00Z' },
    ]) {
      const result = await select({
        ...rollback,
        review: { ...rollback.review, ...patch },
      });
      expect(result.selected).toBeNull();
      expect(result.rollback?.status).toBe('rejected');
      expect(result.rollback?.blockers.length).toBeGreaterThan(0);
      expect(result.attempts[0].manifestSha256).toBe(successor.manifestSha256);
    }
    await expect(
      select({
        ...rollback,
        review: {
          ...rollback.review,
          dateRange: { startDate: '2026-01-02', endDate: '2026-01-01' },
        },
      }),
    ).rejects.toThrow();
    const latest = prepareScheduledTimetableArtifact(timetable, {
      ...metadata,
      capture: successor.manifest.capture,
      correctionRevision: 2,
    });
    await run(latest, sourceReview('correction', latest, successor));
    const stale = await selectRetainedScheduledTimetable({
      ...settings,
      scope,
      serviceDate: '2026-01-01',
      rollback,
    });
    expect(stale.selected).toBeNull();
    expect(stale.rollback?.blockers).toContain(
      'rollback-from-is-not-current-selection',
    );
  });

  it('rechecks the older target and reports an incomplete query when its files are damaged', async () => {
    const { first, settings, rollback, select } = await fixture();
    const notice = join(settings.storeDir, first.manifestSha256, 'NOTICE.txt');
    const original = await readFile(notice);
    await writeFile(notice, 'damaged');
    const result = await select();
    expect(result.selected).toBeNull();
    expect(result.rollback?.blockers).toEqual([
      'rollback-target-is-not-eligible',
    ]);
    expect(result.attempts.at(-1)?.reason).toBe('artifact-verification-failed');
    const query = await queryRetainedScheduledDepartures({
      ...settings,
      scope,
      rollback,
      startInstant: '2026-01-02T00:30:00+08:00',
      endInstant: '2026-01-02T01:30:00+08:00',
    });
    expect(query.complete).toBe(false);
    expect(query.departures).toEqual([]);
    expect(query.serviceDays[0]).toMatchObject({
      manifestSha256: null,
      rollback: { status: 'rejected' },
    });
    await writeFile(notice, original);
    expect((await select()).rollback?.status).toBe('applied');
  });
});
