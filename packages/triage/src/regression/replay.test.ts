import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { describe, expect, test, vi } from 'vitest';
import type { RegressionCase } from './case.js';
import {
  evaluateRegressionResult,
  isPartialSemanticMatch,
  materializeDataAtRevision,
  replayRegressionCase,
} from './replay.js';

const FIXTURE_DATA_DIR = resolve(
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(import.meta.dirname, '../../../../fixtures/generated/data'),
);

const ignoreCase: RegressionCase = {
  id: 'test-ignore-case',
  title: 'Ignore case',
  role: 'regression',
  labels: ['relevance'],
  source: {
    kind: 'commit',
    url: 'https://github.com/foldaway/mrtdown-data/commit/1111111',
    baseRevision: '1111111',
    candidateRevision: '2222222',
    resolutionRevision: null,
  },
  input: {
    kind: 'model-evidence',
    evidence: {
      ts: '2026-01-01T00:00:00+08:00',
      text: 'Bus-only evidence.',
    },
  },
  observed: {
    outcome: { kind: 'create', issueType: 'disruption' },
    assertions: [],
  },
  expected: {
    outcome: { kind: 'ignore' },
    assertions: [],
  },
  rationale: 'Test case.',
};

describe('regression replay', () => {
  test('runs semantic replay against an explicitly isolated data root', async () => {
    const triage = vi.fn().mockResolvedValue({
      result: { kind: 'irrelevant-content' },
    });
    const extract = vi.fn();

    const report = await replayRegressionCase(ignoreCase, {
      dataDir: FIXTURE_DATA_DIR,
      dependencies: {
        extractClaimsFromNewEvidence: extract,
        triageNewEvidence: triage,
      },
    });

    expect(report).toMatchObject({
      caseId: 'test-ignore-case',
      passed: true,
      mismatches: [],
      actual: {
        outcome: { kind: 'ignore' },
        claims: [],
        impactEvents: [],
      },
    });
    expect(triage).toHaveBeenCalledOnce();
    expect(extract).not.toHaveBeenCalled();
  });

  test('evaluates required and forbidden semantic assertions', () => {
    const regressionCase: RegressionCase = {
      ...ignoreCase,
      expected: {
        outcome: {
          kind: 'update',
          issueId: '2026-01-01-test-issue',
        },
        assertions: [
          {
            kind: 'claim',
            presence: 'required',
            match: {
              entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
              effect: { service: { kind: 'reduced-service' } },
            },
          },
          {
            kind: 'impact-event',
            presence: 'forbidden',
            match: {
              type: 'service_effects.set',
              effect: { kind: 'no-service' },
            },
          },
        ],
      },
    };

    const mismatches = evaluateRegressionResult(regressionCase, {
      outcome: {
        kind: 'update',
        issueId: '2026-01-01-test-issue',
      },
      claims: [
        {
          entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
          effect: {
            service: { kind: 'reduced-service' },
            facility: null,
          },
          scopes: { service: null },
          statusSignal: 'open',
          timeHints: null,
          causes: [],
        },
      ],
      impactEvents: [],
      triageResult: {
        result: {
          kind: 'part-of-existing-issue',
          issueId: '2026-01-01-test-issue',
        },
      },
    });

    expect(mismatches).toEqual([]);
  });

  test('matches nested objects and unordered semantic arrays', () => {
    expect(
      isPartialSemanticMatch(
        {
          periods: [
            { kind: 'fixed', startAt: '2026-01-01', endAt: null },
            { kind: 'fixed', startAt: '2026-02-01', endAt: null },
          ],
        },
        {
          periods: [{ kind: 'fixed', startAt: '2026-02-01' }],
        },
      ),
    ).toBe(true);
  });

  test('materializes historical data into a disposable directory', async () => {
    const materialized = await materializeDataAtRevision('HEAD');

    try {
      await expect(
        access(resolve(materialized.dataDir, 'issue')),
      ).resolves.toBe(undefined);
      expect(materialized.dataDir).not.toBe(
        resolve(import.meta.dirname, '../../../../data'),
      );
    } finally {
      await materialized.cleanup();
    }
  });

  test('normalizes legacy station-code timestamps in historical data', async () => {
    const materialized = await materializeDataAtRevision(
      '065b569402de01e80935e7474351ae7991fb5622',
    );

    try {
      const adm = JSON.parse(
        await readFile(
          resolve(materialized.dataDir, 'station/ADM.json'),
          'utf8',
        ),
      ) as {
        stationCodes: Array<{ startedAt: string }>;
      };
      expect(adm.stationCodes[0]?.startedAt).toBe('1996-02-10');

      const repo = new MRTDownRepository({
        store: new FileStore(materialized.dataDir),
      });
      expect(repo.stations.list()).toHaveLength(231);
    } finally {
      await materialized.cleanup();
    }
  });
});
