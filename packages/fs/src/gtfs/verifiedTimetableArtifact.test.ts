import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactFixture as fixture } from './__tests__/artifactFixture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import { scopedReviewDraftSha256 } from './scopedReviewContract.js';
import { verifyScheduledTimetableArtifact } from './timetableArtifact.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

describe('verified timetable artifact preparation', () => {
  it('derives source, mapping and feed metadata from verified files and a version-2 draft', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-verified-artifact-'));
    try {
      const { capture, identity, options } = await fixture(root);
      const run = () =>
        prepareVerifiedGtfsTimetableArtifact(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          options,
        );
      const result = await run();
      const repeat = await run();
      expect(repeat.manifestBytes).toEqual(result.manifestBytes);
      expect(repeat.timetableBytes).toEqual(result.timetableBytes);
      expect(repeat.noticeBytes).toEqual(result.noticeBytes);
      expect(result.manifest).toMatchObject({
        capture,
        identity,
        mapping: {
          version: 'synthetic-v1',
          draftSha256: scopedReviewDraftSha256(options.draft),
        },
        feedRange: { startDate: '2026-01-01', endDate: '2026-01-07' },
        sourceFeedInfo: [{ feed_version: '0.1', feed_start_date: '20260101' }],
      });
      expect(result.review.readiness).toBe('unapproved');
      expect(result.generationEligible).toBe(false);
      expect(result.coverage).toMatchObject({
        sourceTripDateCount: 2,
        assignedTripDateCount: 2,
        missingTripDateCount: 0,
      });
      const { timetable } = verifyScheduledTimetableArtifact(
        result.manifestBytes,
        result.manifestSha256,
        result,
      );
      expect(timetable.timetable.trips[0]).toMatchObject({
        providerTripId: '0009007199254740993',
        stopTimes: [
          { stopSequence: '09007199254740992', departureSeconds: 90000 },
          { stopSequence: '9007199254740993', departureSeconds: 91800 },
        ],
      });
      expect(timetable.assignments[0].dateRanges).toEqual([
        { startDate: '2026-01-01', endDate: '2026-01-02' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves version-3 platform groups and exposes unresolved dates without approving them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-verified-group-artifact-'));
    try {
      const { options } = await fixture(root, true);
      const first = await prepareVerifiedGtfsTimetableArtifact(
        join(root, 'schedule.zip'),
        join(root, 'capture.json'),
        options,
      );
      const { timetable } = verifyScheduledTimetableArtifact(
        first.manifestBytes,
        first.manifestSha256,
        first,
      );
      expect(timetable.patterns[0].pattern.stops[0].platformIds).toEqual([
        'A',
        'C',
      ]);
      expect(first.manifest.mapping.draftSha256).toBe(
        groupedScopedReviewDraftSha256(options.draft),
      );
      for (const decision of options.draft.decisions) {
        if (decision.kind === 'pattern') {
          decision.disposition = 'unresolved';
          delete decision.target;
        }
      }
      const partial = await prepareVerifiedGtfsTimetableArtifact(
        join(root, 'schedule.zip'),
        join(root, 'capture.json'),
        options,
      );
      expect(partial.coverage).toMatchObject({
        sourceTripDateCount: 2,
        assignedTripDateCount: 0,
        missingTripDateCount: 2,
      });
      expect(partial.review.readiness).toBe('unresolved');
      expect(partial.generationEligible).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects stale mapping identity, corrupt captures, missing feed dates and caller-supplied source metadata', async () => {
    const root = await mkdtemp(
      join(tmpdir(), 'gtfs-verified-artifact-errors-'),
    );
    try {
      const run = (options: Awaited<ReturnType<typeof fixture>>['options']) =>
        prepareVerifiedGtfsTimetableArtifact(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          options,
        );
      let input = await fixture(root);
      input.options.draft.identity.canonicalCommit = 'b'.repeat(40);
      await expect(run(input.options)).rejects.toThrow(
        'Draft input identity differs',
      );
      input = await fixture(root);
      await writeFile(join(root, 'schedule.zip'), 'corrupt');
      await expect(run(input.options)).rejects.toThrow('size and SHA-256');
      input = await fixture(root);
      const path = join(root, 'data/station/S.json');
      const station = JSON.parse(await readFile(path, 'utf8'));
      station.layout.platforms[0].label = 'Changed';
      await writeFile(path, JSON.stringify(station));
      await expect(run(input.options)).rejects.toThrow(
        'Draft input identity differs',
      );
      for (const text of [
        'feed_start_date,feed_end_date\n',
        'feed_start_date,feed_end_date\n20260101,\n',
        'feed_start_date,feed_end_date\n20260230,20260301\n',
      ]) {
        input = await fixture(root, false, { 'feed_info.txt': text });
        await expect(run(input.options)).rejects.toThrow();
      }
      input = await fixture(root);
      await expect(
        run({
          ...input.options,
          ...{ feedRange: { startDate: '2000-01-01', endDate: '2099-12-31' } },
        }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
