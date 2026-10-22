import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assessScheduledTimetableSourceChange,
  type ScheduledTimetableArtifactManifest,
  type ScheduledTimetableSourceReview,
} from '@mrtdown/core';
import { afterEach, describe, expect, it } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import {
  prepareScheduledTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from './timetableArtifact.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'timetable-source-'));
  roots.push(root);
  const { options } = await artifactFixture(root);
  const prepared = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    options,
  );
  const { manifestSha256, manifest, timetable } = {
    manifestSha256: prepared.manifestSha256,
    ...verifyScheduledTimetableArtifact(
      prepared.manifestBytes,
      prepared.manifestSha256,
      prepared,
    ),
  };
  const incumbent = { manifestSha256, manifest };
  function candidate(changes: Partial<ScheduledTimetableArtifactManifest>) {
    const {
      timetable: _timetable,
      notice: _notice,
      ...metadata
    } = { ...manifest, ...changes };
    const next = prepareScheduledTimetableArtifact(timetable, metadata);
    const verified = verifyScheduledTimetableArtifact(
      next.manifestBytes,
      next.manifestSha256,
      next,
    );
    return { manifestSha256: next.manifestSha256, manifest: verified.manifest };
  }
  return { incumbent, candidate };
}

type Artifact = Awaited<ReturnType<typeof fixture>>['incumbent'];
function review(
  decision: ScheduledTimetableSourceReview['decision'],
  predecessor: Artifact | null,
  successor: Artifact,
): ScheduledTimetableSourceReview {
  const identity = (artifact: Artifact) => ({
    manifestSha256: artifact.manifestSha256,
    snapshotSha256: artifact.manifest.capture.sha256,
  });
  return {
    schemaVersion: 1,
    documentKind: 'scheduled-timetable-source-review',
    decision,
    predecessor: predecessor ? identity(predecessor) : null,
    successor: identity(successor),
    reviewer: 'Synthetic source reviewer',
    reviewedAt: '2026-01-20T00:00:00Z',
    reason: 'Synthetic ordering decision; does not approve a real release.',
  };
}
const importInstant = '2026-01-20T00:00:00Z';

describe('timetable source admission after artifact verification', () => {
  it('requires an audited baseline and lineage even when download dates or version strings look newer', async () => {
    const { incumbent, candidate } = await fixture();
    const assess = (
      next: Artifact,
      approval?: ScheduledTimetableSourceReview,
    ) =>
      assessScheduledTimetableSourceChange({
        candidate: next,
        incumbent,
        review: approval,
        importInstant,
      });
    expect(
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        importInstant,
      }).sourceEligible,
    ).toBe(false);
    expect(
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        importInstant,
        review: review('baseline', null, incumbent),
      }),
    ).toMatchObject({ sourceEligible: true, action: 'baseline' });
    expect(assess(incumbent)).toMatchObject({
      sourceEligible: true,
      action: 'unchanged',
    });

    const next = candidate({
      capture: {
        ...incumbent.manifest.capture,
        sha256: '1'.repeat(64),
        retrieved_at: '2026-01-19T00:00:00Z',
      },
      sourceFeedInfo: [
        { ...incumbent.manifest.sourceFeedInfo[0], feed_version: '0.0' },
      ],
    });
    expect(assess(next)).toMatchObject({
      sourceEligible: false,
      blockers: ['source-review-required'],
      providerVersion: { value: '0.0', ordering: 'unproven' },
    });
    expect(assess(next, review('successor', incumbent, next))).toMatchObject({
      sourceEligible: true,
      action: 'successor',
    });
    const unversioned = candidate({
      capture: { ...next.manifest.capture, sha256: '5'.repeat(64) },
      sourceFeedInfo: [
        { ...incumbent.manifest.sourceFeedInfo[0], feed_version: '' },
      ],
    });
    expect(assess(unversioned).sourceEligible).toBe(false);
    expect(
      assess(unversioned, review('successor', incumbent, unversioned)),
    ).toMatchObject({
      sourceEligible: true,
      providerVersion: { value: null, ordering: 'unproven' },
    });
    const stale = review('successor', incumbent, next);
    stale.successor.snapshotSha256 = '2'.repeat(64);
    expect(assess(next, stale).blockers).toContain('source-review-mismatch');
    expect(
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        incumbent: next,
        importInstant,
      }).sourceEligible,
    ).toBe(false);
    expect(incumbent.manifest.sourceFeedInfo[0].feed_version).toBe('0.1');
  });

  it('quarantines a different snapshot with the same provider version until that exact conflict is resolved', async () => {
    const { incumbent, candidate } = await fixture();
    const next = candidate({
      capture: { ...incumbent.manifest.capture, sha256: '2'.repeat(64) },
    });
    const assess = (approval?: ScheduledTimetableSourceReview) =>
      assessScheduledTimetableSourceChange({
        candidate: next,
        incumbent,
        review: approval,
        importInstant,
      });
    expect(assess()).toMatchObject({
      sourceEligible: false,
      action: null,
      blockers: ['provider-version-conflict'],
    });
    expect(assess(review('successor', incumbent, next)).blockers).toContain(
      'source-review-mismatch',
    );
    expect(
      assess(review('resolve-version-conflict', incumbent, next)),
    ).toMatchObject({ sourceEligible: true, action: 'successor' });
    const wrongPredecessor = review(
      'resolve-version-conflict',
      incumbent,
      next,
    );
    wrongPredecessor.predecessor = {
      manifestSha256: '3'.repeat(64),
      snapshotSha256: incumbent.manifest.capture.sha256,
    };
    expect(assess(wrongPredecessor).sourceEligible).toBe(false);
    expect(
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        incumbent,
        importInstant,
      }).action,
    ).toBe('unchanged');
  });

  it('admits only reviewed increasing corrections with consistent source metadata and valid import timing', async () => {
    const { incumbent, candidate } = await fixture();
    function assess(
      next: Artifact,
      approval = review('correction', incumbent, next),
    ) {
      return assessScheduledTimetableSourceChange({
        candidate: next,
        incumbent,
        review: approval,
        importInstant,
      });
    }
    const corrected = candidate({
      correctionRevision: 2,
      mapping: { ...incumbent.manifest.mapping, version: 'corrected' },
    });
    expect(assess(corrected)).toMatchObject({
      sourceEligible: true,
      action: 'correction',
    });
    const sameRevision = candidate({
      mapping: { ...incumbent.manifest.mapping, version: 'conflict' },
    });
    expect(assess(sameRevision).blockers).toContain(
      'correction-revision-not-increased',
    );
    expect(
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        incumbent: corrected,
        importInstant,
        review: review('correction', corrected, incumbent),
      }).blockers,
    ).toContain('correction-revision-not-increased');
    const changedSource = candidate({
      correctionRevision: 2,
      identity: {
        ...incumbent.manifest.identity,
        sourceManifest: { 'trips.txt': '4'.repeat(64) },
      },
    });
    expect(assess(changedSource).blockers).toContain(
      'same-snapshot-metadata-conflict',
    );
    const inconsistentRange = candidate({
      correctionRevision: 2,
      feedRange: { startDate: '2026-01-02', endDate: '2026-01-07' },
    });
    expect(assess(inconsistentRange).blockers).toContain(
      'invalid-source-feed-range',
    );
    const missingInfo = candidate({
      correctionRevision: 2,
      sourceFeedInfo: [],
    });
    expect(assess(missingInfo).blockers).toContain('invalid-source-feed-range');

    for (const [retrieved_at, allowed] of [
      ['2026-01-20T00:05:00Z', true],
      ['2026-01-20T00:05:01Z', false],
    ] as const) {
      const future = candidate({
        capture: { ...incumbent.manifest.capture, retrieved_at },
      });
      const result = assessScheduledTimetableSourceChange({
        candidate: future,
        incumbent: future,
        importInstant,
      });
      expect(result.sourceEligible).toBe(allowed);
    }
    for (const reviewedAt of ['2026-01-14T00:00:00Z', '2026-01-20T00:00:01Z']) {
      expect(
        assess(corrected, {
          ...review('correction', incumbent, corrected),
          reviewedAt,
        }).blockers,
      ).toContain('source-review-time-invalid');
    }
    expect(() =>
      assessScheduledTimetableSourceChange({
        candidate: incumbent,
        importInstant: 'invalid',
      }),
    ).toThrow();
  });
});
