import { describe, expect, it } from 'vitest';
import { mergeNoopReview } from './merge-gtfs-noop-review.mjs';

function fixture() {
  const captureSha256 = 'a'.repeat(64);
  const headSha = 'b'.repeat(40);
  const baseSha = 'c'.repeat(40);
  const now = Date.parse('2026-11-26T18:00:00Z');
  const context = {
    repository: 'example/repo',
    prNumber: 502,
    runId: '123',
    captureSha256,
    headSha,
    workflowSha: baseSha,
    branch: `gtfs-review/${captureSha256}`,
    baseBranch: 'main',
    ref: 'refs/heads/main',
    eventName: 'workflow_dispatch',
  };
  const index = {
    manifestSha256: 'd'.repeat(64),
    releaseSha256: 'e'.repeat(64),
  };
  const report = {
    decision: 'no-op',
    reasons: ['Remaining approved service is unchanged.'],
    retainedManifestSha256: index.manifestSha256,
    historicalChanges: { serviceDates: ['2026-11-14'] },
    preparation: {
      captureSha256,
      captureRetrievedAt: '2026-11-25T20:00:00Z',
      baselineCaptureSha256: 'f'.repeat(64),
      baselineReleaseIndex: index,
      serviceDateRange: {
        startDate: '2026-11-09',
        endDateExclusive: '2026-12-01',
      },
      checkedAt: '2026-11-26T17:59:00Z',
      runUrl: 'https://github.com/example/repo/actions/runs/123',
    },
  };
  const freshJson = {
    schemaVersion: 2,
    documentKind: 'gtfs-capture-review-receipt',
    capture: { sha256: captureSha256, retrieved_at: '2026-11-25T20:00:00Z' },
    reports: Object.fromEntries(
      [
        ['json', 'json'],
        ['markdown', 'md'],
      ].map(([format, extension]) => [
        format,
        {
          sha256: '1'.repeat(64),
          byteLength: 100,
          url: `https://github.com/example/repo/releases/download/gtfs-capture-reports-2026-11/${'1'.repeat(64)}.${extension}`,
        },
      ]),
    ),
    canonicalCommit: baseSha,
    runUrl: 'https://github.com/example/repo/actions/runs/123',
    artifactUrl:
      'https://github.com/example/repo/actions/runs/123/artifacts/456',
    comparison: { status: 'available' },
    inspectionOutcome: 'success',
    validation: { outcome: 'success' },
    current: { structuralErrorCount: 0 },
  };
  const freshMarkdown = `# Capture\n\n${freshJson.canonicalCommit}\n${freshJson.runUrl}\n${freshJson.artifactUrl}\n`;
  const automaticMarkdown =
    '## Automatic publication\n\nDecision: **no-op**.\n\nRemaining approved service is unchanged.\n';
  const evidence = {
    actualJson: structuredClone(freshJson),
    freshJson,
    freshMarkdown,
    automaticMarkdown,
    actualMarkdown: `${freshMarkdown}\n${automaticMarkdown}\n## Publication approval\n\nNo publication needed. The completed timetable and desired definition remain unchanged. This PR records capture evidence only.\n`,
  };
  const snapshot = {
    baseSha,
    headSha,
    definitionIdentity: 'absent',
    files: ['md', 'json'].map((extension) => ({
      status: 'A',
      mode: '100644',
      path: `docs/gtfs/captures/${captureSha256}.${extension}`,
    })),
  };
  const pr = {
    state: 'open',
    draft: false,
    user: { login: 'github-actions[bot]' },
    auto_merge: null,
    head: {
      sha: headSha,
      ref: context.branch,
      repo: { full_name: context.repository },
    },
    base: {
      ref: 'main',
      sha: baseSha,
      repo: { full_name: context.repository },
    },
    changed_files: 2,
    requested_reviewers: [] as { login: string }[],
    requested_teams: [] as { slug: string }[],
  };
  const checks = {
    total_count: 1,
    check_runs: [{ status: 'completed', conclusion: 'skipped' }],
  };
  const statuses = { total_count: 0, statuses: [] as { state: string }[] };
  const reviews: { state: string }[] = [];
  const merges: unknown[] = [];
  const args = {
    context,
    report,
    preparedCommit: baseSha,
    preparedDefinition: 'absent',
    evidence,
    snapshot,
    clock: () => now,
    refreshBase: async () => baseSha,
    publicIndex: async () => structuredClone(index),
    api: async (path: string, body?: unknown) => {
      if (body) {
        merges.push({ path, body });
        return { merged: true, message: 'Merged' };
      }
      if (path.includes('/check-runs')) return checks;
      if (path.includes('/status?')) return statuses;
      if (path.includes('/reviews?')) return reviews;
      return pr;
    },
  };
  return { args, pr, checks, statuses, reviews, merges };
}

describe('automatic merge of trusted no-op capture evidence', () => {
  it('accepts original PR base metadata while still rejecting a changed live main', async () => {
    const { args, pr, merges } = fixture();
    pr.base.sha = '0'.repeat(40);
    expect(await mergeNoopReview(args)).toMatchObject({ merged: true });
    merges.splice(0);
    args.refreshBase = async () => 'f'.repeat(40);
    expect(await mergeNoopReview(args)).toMatchObject({
      merged: false,
      reason: 'Main advanced before merging; prepare this capture again.',
    });
    expect(merges).toHaveLength(0);
  });

  it.each([
    'preparation age',
    'capture age',
    'approval window',
  ])('rechecks %s after the awaited checks', async (boundary) => {
    const { args, merges } = fixture();
    let first = Date.parse('2026-11-26T18:00:00Z');
    if (boundary === 'preparation age')
      args.report.preparation.checkedAt = '2026-11-26T17:00:01Z';
    if (boundary === 'capture age')
      args.report.preparation.captureRetrievedAt = '2026-11-23T18:00:01Z';
    if (boundary === 'approval window') {
      first = Date.parse('2026-11-30T15:59:59Z');
      args.report.preparation.checkedAt = '2026-11-30T15:59:00Z';
      args.report.preparation.captureRetrievedAt = '2026-11-30T00:00:00Z';
    }
    let calls = 0;
    args.clock = () => (calls++ === 0 ? first : first + 2000);
    expect(await mergeNoopReview(args)).toMatchObject({
      merged: false,
      reason:
        boundary === 'approval window'
          ? 'The approved service-date window is inactive.'
          : 'No-op preparation or capture is stale.',
    });
    expect(calls).toBe(2);
    expect(merges).toHaveLength(0);
  });

  it('still merges when the second clock sample remains fresh', async () => {
    const { args, merges } = fixture();
    let calls = 0;
    args.clock = () => Date.parse('2026-11-26T18:00:00Z') + calls++ * 2000;
    expect(await mergeNoopReview(args)).toMatchObject({ merged: true });
    expect(calls).toBe(2);
    expect(merges).toHaveLength(1);
  });

  it.each([
    'reviewers',
    'teams',
    'changes requested',
    'head',
  ])('refreshes late %s changes before merging', async (change) => {
    const { args, pr, reviews, merges } = fixture();
    args.refreshBase = async () => {
      if (change === 'reviewers')
        pr.requested_reviewers.push({ login: 'maintainer' });
      if (change === 'teams') pr.requested_teams.push({ slug: 'maintainers' });
      if (change === 'changes requested')
        reviews.push({ state: 'CHANGES_REQUESTED' });
      if (change === 'head') pr.head.sha = '0'.repeat(40);
      return args.preparedCommit;
    };
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it.each([
    '{malformed',
    'null',
    '[]',
    '"not an object"',
  ])('refuses malformed or non-object committed JSON: %s', async (actualJson) => {
    const { args, merges } = fixture();
    expect(
      await mergeNoopReview({
        ...args,
        evidence: { ...args.evidence, actualJson },
      }),
    ).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it('accepts valid committed JSON text and keeps infrastructure errors distinct', async () => {
    const { args, merges } = fixture();
    expect(
      await mergeNoopReview({
        ...args,
        evidence: {
          ...args.evidence,
          actualJson: JSON.stringify(args.evidence.actualJson),
        },
      }),
    ).toMatchObject({ merged: true });
    merges.splice(0);
    args.api = async () => {
      throw new Error('Network failed');
    };
    await expect(mergeNoopReview(args)).rejects.toThrow('Network failed');
    expect(merges).toHaveLength(0);
  });

  it('merges the exact verified head without requiring a nonexistent bot PR Validate check', async () => {
    const { args, merges } = fixture();
    expect(await mergeNoopReview(args)).toMatchObject({ merged: true });
    expect(merges).toEqual([
      {
        path: '/repos/example/repo/pulls/502/merge',
        body: expect.objectContaining({
          sha: args.context.headSha,
          merge_method: 'squash',
        }),
      },
    ]);
    expect(JSON.stringify(merges)).toContain(
      'Co-Authored-By: Codex <noreply@openai.com>',
    );
  });

  it('rejects an earlier inspection receipt until refreshed from the trusted run', async () => {
    const { args } = fixture();
    const old = {
      canonicalCommit: 'f'.repeat(40),
      runUrl: 'https://github.com/example/repo/actions/runs/1',
      artifactUrl: 'https://github.com/example/repo/actions/runs/1/artifacts/2',
    };
    for (const field of ['artifactUrl', 'runUrl', 'canonicalCommit'] as const) {
      args.evidence.actualMarkdown = args.evidence.actualMarkdown.replaceAll(
        args.evidence.actualJson[field],
        old[field],
      );
      args.evidence.actualJson[field] = old[field];
    }
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
  });

  it.each([
    'json',
    'markdown',
    'archive URL',
    'archive hash',
    'legacy receipt',
  ])('refuses unbounded or invalid %s evidence', async (change) => {
    const { args, merges } = fixture();
    if (change === 'json')
      args.evidence.actualJson = JSON.stringify({
        padding: 'x'.repeat(16 * 1024),
      });
    if (change === 'markdown')
      args.evidence.actualMarkdown += 'x'.repeat(32 * 1024);
    if (change === 'archive URL') {
      args.evidence.actualJson.reports.json.url =
        'https://example.com/report.json';
      args.evidence.freshJson.reports.json.url =
        'https://example.com/report.json';
    }
    if (change === 'archive hash')
      args.evidence.actualJson.reports.json.sha256 = '2'.repeat(64);
    if (change === 'legacy receipt') args.evidence.actualJson.schemaVersion = 1;
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it('accepts a complete retained-timetable proof and binds it to both captures and the retained release', async () => {
    const { args, merges } = fixture();
    const withProof = Object.assign(args.report, {
      retainedTimetableProof: {
        schemaVersion: 1,
        documentKind: 'gtfs-retained-timetable-no-op-proof',
        candidateCaptureSha256: args.context.captureSha256,
        baselineCaptureSha256: args.report.preparation.baselineCaptureSha256,
        retainedManifestSha256: args.report.retainedManifestSha256,
        checkedAt: args.report.preparation.checkedAt,
        unchangedFromServiceDate: '2026-11-27',
        serviceDateRange: args.report.preparation.serviceDateRange,
        expiredServiceDates: ['2026-11-14'],
        outsideApprovedServiceDates: ['2026-12-02'],
        policyRevision: 'canonical-schedule-v3',
        policySha256: 'e'.repeat(64),
      },
    });
    expect(await mergeNoopReview(args)).toMatchObject({ merged: true });
    merges.splice(0);
    Object.assign(withProof.retainedTimetableProof, {
      candidateCaptureSha256: '0'.repeat(64),
    });
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it.each([
    'ready',
    'hold',
    'unchanged',
    'disabled',
  ])('never merges a %s result', async (decision) => {
    const { args, merges } = fixture();
    args.report.decision = decision;
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it.each([
    'definition',
    'code',
    'other-capture',
    'deletion',
    'symlink',
    'executable',
  ])('rejects a diff with %s changes', async (change) => {
    const { args, merges } = fixture();
    const file = args.snapshot.files[0];
    if (change === 'definition') file.path = 'releases/gtfs.json';
    if (change === 'code')
      file.path = 'scripts/prepare-gtfs-automatic-release.mjs';
    if (change === 'other-capture')
      file.path = `docs/gtfs/captures/${'f'.repeat(64)}.md`;
    if (change === 'deletion') file.status = 'D';
    if (change === 'symlink') file.mode = '120000';
    if (change === 'executable') file.mode = '100755';
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it.each([
    'capture',
    'run',
    'head',
    'base',
    'definition',
    'stale',
    'expired',
    'proof',
    'comparison',
    'prose',
    'report',
  ])('fails closed on changed or missing %s evidence', async (change) => {
    const { args, merges } = fixture();
    if (change === 'capture')
      args.report.preparation.captureSha256 = '0'.repeat(64);
    if (change === 'run')
      args.report.preparation.runUrl =
        'https://github.com/example/repo/actions/runs/2';
    if (change === 'head') args.snapshot.headSha = '0'.repeat(40);
    if (change === 'base') args.snapshot.baseSha = '0'.repeat(40);
    if (change === 'definition')
      args.snapshot.definitionIdentity = '0'.repeat(40);
    if (change === 'stale')
      args.report.preparation.checkedAt = '2026-11-26T16:00:00Z';
    if (change === 'expired')
      args.report.preparation.serviceDateRange.endDateExclusive = '2026-11-27';
    if (change === 'proof') args.report.historicalChanges.serviceDates = [];
    if (change === 'comparison')
      args.evidence.actualJson.comparison.status = 'unavailable';
    if (change === 'prose')
      args.evidence.actualMarkdown = args.evidence.actualMarkdown.replace(
        '# Capture',
        '# Edited',
      );
    if (change === 'report')
      args.evidence.actualMarkdown += '\nAn unverified claim.\n';
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it.each([
    'pending-check',
    'failed-check',
    'pending-status',
    'failed-status',
    'review',
    'requested-review',
    'fork',
    'head-race',
    'base-race',
    'baseline',
  ])('leaves the PR open for %s', async (change) => {
    const { args, pr, checks, statuses, reviews, merges } = fixture();
    if (change === 'pending-check') checks.check_runs[0].status = 'in_progress';
    if (change === 'failed-check') checks.check_runs[0].conclusion = 'failure';
    if (change.endsWith('status')) {
      statuses.total_count = 1;
      statuses.statuses.push({
        state: change === 'pending-status' ? 'pending' : 'failure',
      });
    }
    if (change === 'review') reviews.push({ state: 'CHANGES_REQUESTED' });
    if (change === 'requested-review')
      pr.requested_reviewers.push({ login: 'reviewer' });
    if (change === 'fork') pr.head.repo.full_name = 'someone/fork';
    if (change === 'head-race') pr.head.sha = '0'.repeat(40);
    if (change === 'base-race') args.refreshBase = async () => '0'.repeat(40);
    if (change === 'baseline')
      args.publicIndex = async () => ({
        manifestSha256: '0'.repeat(64),
        releaseSha256: '0'.repeat(64),
      });
    expect(await mergeNoopReview(args)).toMatchObject({ merged: false });
    expect(merges).toHaveLength(0);
  });

  it('honors GitHub refusing the immediate merge instead of queueing or bypassing protections', async () => {
    const { args } = fixture();
    const api = args.api;
    args.api = async (path, body) =>
      body
        ? { merged: false, message: 'Required checks not satisfied' }
        : api(path);
    expect(await mergeNoopReview(args)).toEqual({
      merged: false,
      reason: 'Required checks not satisfied',
    });
  });
});
