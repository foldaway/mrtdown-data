import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactFixture } from './__tests__/artifactFixture.js';
import { groupedScopedReviewDraftSha256 } from './groupedReviewContract.js';
import {
  scopedReviewDateSetId,
  scopedReviewDraftSha256,
} from './scopedReviewContract.js';
import {
  GtfsTimetableReleaseReviewSchema,
  gtfsTimetableMappingApprovalSha256,
  inspectGtfsTimetableRelease,
} from './timetableRelease.js';
import { prepareVerifiedGtfsTimetableArtifact } from './verifiedTimetableArtifact.js';

type Draft = Awaited<ReturnType<typeof artifactFixture>>['options']['draft'];
async function reviewed(
  root: string,
  grouped = false,
  edit?: (draft: Draft) => void,
) {
  const { capture, options } = await artifactFixture(root, grouped);
  if (edit) {
    edit(options.draft);
  }
  capture.rights_status = 'redistribution_permitted';
  await writeFile(join(root, 'capture.json'), JSON.stringify(capture));
  const mappingApproval = {
    schemaVersion: options.draft.schemaVersion,
    documentKind: 'gtfs-scoped-mapping-approval',
    identity: options.draft.identity,
    draftSha256: grouped
      ? groupedScopedReviewDraftSha256(options.draft)
      : scopedReviewDraftSha256(options.draft),
    reviewer: 'Synthetic mapping reviewer',
    reason: 'Synthetic approval for release gate tests only.',
  };
  const artifact = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    { ...options, mappingApproval },
  );
  const currentTerms = {
    licence: {
      reference: options.currentLicenceReference,
      sha256: '1'.repeat(64),
    },
    apiTerms: {
      reference:
        'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
      sha256: '2'.repeat(64),
    },
  };
  const releaseReview = GtfsTimetableReleaseReviewSchema.parse({
    schemaVersion: 1,
    documentKind: 'gtfs-timetable-release-review',
    manifestSha256: artifact.manifestSha256,
    mappingApprovalSha256: gtfsTimetableMappingApprovalSha256(mappingApproval),
    reviewer: 'Synthetic release reviewer',
    reviewedAt: '2026-01-16T00:00:00Z',
    decision: 'release-permitted',
    terms: structuredClone(currentTerms),
    licenceVersion: 'synthetic-v1',
    obligations: 'Synthetic source acknowledgement and licence link.',
    captureConditions:
      'Synthetic review found no additional release conditions.',
    effectiveAt: null,
  });
  return {
    ...options,
    mappingApproval,
    currentTerms,
    releaseReview,
    releaseInstant: '2026-01-20T00:00:00Z',
  };
}

describe('timetable release readiness', () => {
  it('requires complete mapping and exact release review for both draft formats without publishing or changing preview eligibility', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-'));
    try {
      for (const grouped of [false, true]) {
        const options = await reviewed(root, grouped);
        const result = await inspectGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          options,
        );
        expect(result.release).toMatchObject({
          eligible: true,
          blockers: [],
          mappingApprovalSha256: options.releaseReview.mappingApprovalSha256,
        });
        expect(result.review.mappingReviewEligible).toBe(true);
        expect(result.generationEligible).toBe(false);
        expect(result.coverage.missingTripDateCount).toBe(0);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports absent approvals and permission and blocks changed terms and releases before the reviewed Effective Date', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-conditions-'));
    try {
      const { options } = await artifactFixture(root);
      const missing = await inspectGtfsTimetableRelease(
        join(root, 'schedule.zip'),
        join(root, 'capture.json'),
        { ...options, releaseInstant: '2026-01-20T00:00:00Z' },
      );
      expect(missing.release).toMatchObject({
        eligible: false,
        blockers: [
          'Mapping review is not complete',
          'Capture redistribution is not permitted',
          'Current terms have not been supplied',
          'Release review is missing',
        ],
      });
      const ready = await reviewed(root);
      const run = (input: typeof ready) =>
        inspectGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          input,
        );
      for (const field of ['licence', 'apiTerms'] as const) {
        const changed = structuredClone(ready);
        changed.currentTerms[field].sha256 = '3'.repeat(64);
        expect((await run(changed)).release.blockers).toContain(
          'Release review does not match current terms',
        );
      }
      ready.releaseReview.effectiveAt = '2026-01-20T08:00:01+08:00';
      expect((await run(ready)).release.blockers).toContain(
        'Release precedes the reviewed Effective Date',
      );
      ready.releaseReview.effectiveAt = '2026-01-20T08:00:00+08:00';
      expect((await run(ready)).release.eligible).toBe(true);
      for (const reviewedAt of [
        '2026-01-14T00:00:00Z',
        '2026-01-21T00:00:00Z',
      ]) {
        ready.releaseReview.reviewedAt = reviewedAt;
        expect((await run(ready)).release.blockers).toContain(
          'Release review time must fall between capture retrieval and release',
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('invalidates release review after artifact or approval edits and rejects stale mapping approvals', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-binding-'));
    try {
      const ready = await reviewed(root);
      const run = (input: typeof ready) =>
        inspectGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          input,
        );
      const revision = await run({ ...ready, correctionRevision: 2 });
      expect(revision.release.blockers).toContain(
        'Release review does not bind this artifact',
      );
      const approval = structuredClone(ready);
      approval.mappingApproval.reason = 'Changed synthetic review text.';
      expect((await run(approval)).release.blockers).toContain(
        'Release review does not bind this mapping approval',
      );
      const terms = structuredClone(ready);
      terms.currentTerms.licence.reference =
        'https://example.test/other-licence';
      expect((await run(terms)).release.blockers).toContain(
        'Current terms do not match the artifact licence reference',
      );
      ready.draft.decisions[0].reason = 'Changed mapping draft text.';
      await expect(run(ready)).rejects.toThrow(
        'Approval does not bind this draft',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('preserves reviewed exclusions as explicit coverage gaps while blocking unresolved decisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-coverage-'));
    try {
      const unresolved = await reviewed(root, true, (draft) => {
        for (const decision of draft.decisions) {
          if (decision.kind === 'pattern') {
            decision.disposition = 'unresolved';
            delete decision.target;
          }
        }
      });
      const run = (input: typeof unresolved) =>
        inspectGtfsTimetableRelease(
          join(root, 'schedule.zip'),
          join(root, 'capture.json'),
          input,
        );
      expect((await run(unresolved)).release.blockers).toContain(
        'Mapping review is not complete',
      );
      const excluded = await reviewed(root, true, (draft) => {
        const pattern = draft.decisions.find((item) => item.kind === 'pattern');
        if (pattern?.kind !== 'pattern') {
          throw new Error('Missing synthetic pattern');
        }
        const date = '2026-01-01',
          other = '2026-01-02';
        const excludedDecision = {
          ...pattern,
          disposition: 'excluded' as const,
          dateSetId: scopedReviewDateSetId([other]),
          reason: 'Synthetic explicit exclusion.',
        };
        delete excludedDecision.target;
        pattern.dateSetId = scopedReviewDateSetId([date]);
        draft.dateSets = [
          { id: pattern.dateSetId, serviceDates: [date] },
          { id: excludedDecision.dateSetId, serviceDates: [other] },
        ];
        draft.decisions.push(excludedDecision);
      });
      const result = await run(excluded);
      expect(result.release.eligible).toBe(true);
      expect(result.review.excludedPatternDates).toBe(1);
      expect(result.coverage).toMatchObject({
        assignedTripDateCount: 1,
        missingTripDateCount: 1,
      });
      expect(result.generationEligible).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
