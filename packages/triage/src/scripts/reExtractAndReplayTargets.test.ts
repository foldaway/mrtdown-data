import type { ImpactEvent, IssueBundle } from '@mrtdown/core';
import { describe, expect, test } from 'vitest';
import {
  collectReExtractTargets,
  hasPeriodViolation,
  parseReExtractArgs,
} from './reExtractAndReplayTargets.js';

function makeIssueBundle(params: {
  issueId: string;
  evidence: Array<{ id: string; ts: string; text: string }>;
  impactEvents: ImpactEvent[];
}): IssueBundle {
  return {
    issue: { id: params.issueId } as IssueBundle['issue'],
    evidence: params.evidence.map((evidence) => ({
      ...evidence,
      type: 'official-statement',
    })) as IssueBundle['evidence'],
    impactEvents: params.impactEvents,
    path: `data/issue/${params.issueId}`,
  };
}

function makeRepo(bundles: IssueBundle[]) {
  const bundlesById = new Map(
    bundles.map((bundle) => [bundle.issue.id, bundle] as const),
  );

  return {
    issues: {
      listIds: () => [...bundlesById.keys()],
      get: (issueId: string) => bundlesById.get(issueId) ?? null,
    },
  } as Parameters<typeof collectReExtractTargets>[0];
}

describe('parseReExtractArgs', () => {
  test('parses degraded-future-no-service mode and filters', () => {
    expect(
      parseReExtractArgs([
        '--mode',
        'degraded-future-no-service',
        '--issue',
        'issue-1',
        '--evidence',
        'ev-1',
        '--dry-run',
      ]),
    ).toEqual({
      dryRun: true,
      mode: 'degraded-future-no-service',
      issueIds: new Set(['issue-1']),
      evidenceIds: new Set(['ev-1']),
    });
  });
});

describe('hasPeriodViolation', () => {
  test('flags future open periods as violations', () => {
    expect(
      hasPeriodViolation({
        id: 'ie-1',
        type: 'periods.set',
        ts: '2025-12-05T22:12:16+08:00',
        basis: { evidenceId: 'ev-1' },
        entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
        periods: [
          {
            kind: 'fixed',
            startAt: '2026-01-01T00:00:00+08:00',
            endAt: null,
          },
        ],
      }),
    ).toBe(true);
  });
});

describe('collectReExtractTargets', () => {
  test('finds degraded-service evidence misclassified as future no-service', () => {
    const bundle = makeIssueBundle({
      issueId: '2025-12-05-ewl-track-testing-depot-disconnection',
      evidence: [
        {
          id: 'ev-bad',
          ts: '2025-12-05T22:12:16+08:00',
          text: 'East-West Line (EWL) track testing of newly connected sections is causing longer waits of up to 17 minutes for trains from Bedok and Kembangan. A final service suspension to disconnect the EWL from Changi Depot is planned for the first half of 2026, signaling further disruption.',
        },
      ],
      impactEvents: [
        {
          id: 'ie-1',
          type: 'service_effects.set',
          ts: '2025-12-05T22:12:16+08:00',
          basis: { evidenceId: 'ev-bad' },
          entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
          effect: { kind: 'no-service' },
        },
        {
          id: 'ie-2',
          type: 'periods.set',
          ts: '2025-12-05T22:12:16+08:00',
          basis: { evidenceId: 'ev-bad' },
          entity: { type: 'service', serviceId: 'EWL_MAIN_E' },
          periods: [
            {
              kind: 'fixed',
              startAt: '2026-01-01T00:00:00+08:00',
              endAt: '2026-07-01T00:00:00+08:00',
            },
          ],
        },
      ],
    });

    const repo = makeRepo([bundle]);

    expect(
      collectReExtractTargets(repo, {
        mode: 'degraded-future-no-service',
      }),
    ).toEqual(
      new Map([
        [
          '2025-12-05-ewl-track-testing-depot-disconnection',
          new Set(['ev-bad']),
        ],
      ]),
    );
  });

  test('does not flag explicit planned no-service closures', () => {
    const bundle = makeIssueBundle({
      issueId: '2026-01-25-bplrt-track-renewal-full-day-closure',
      evidence: [
        {
          id: 'ev-closure',
          ts: '2026-01-25T10:06:50+08:00',
          text: 'No train service between Choa Chu Kang and Bukit Panjang due to full-day track renewal works.',
        },
      ],
      impactEvents: [
        {
          id: 'ie-1',
          type: 'service_effects.set',
          ts: '2026-01-25T10:06:50+08:00',
          basis: { evidenceId: 'ev-closure' },
          entity: { type: 'service', serviceId: 'BPLRT_A' },
          effect: { kind: 'no-service' },
        },
        {
          id: 'ie-2',
          type: 'periods.set',
          ts: '2026-01-25T10:06:50+08:00',
          basis: { evidenceId: 'ev-closure' },
          entity: { type: 'service', serviceId: 'BPLRT_A' },
          periods: [
            {
              kind: 'fixed',
              startAt: '2026-01-25T05:30:00+08:00',
              endAt: '2026-01-26T00:00:00+08:00',
            },
          ],
        },
      ],
    });

    const repo = makeRepo([bundle]);

    expect(
      collectReExtractTargets(repo, {
        mode: 'degraded-future-no-service',
      }),
    ).toEqual(new Map());
  });
});
