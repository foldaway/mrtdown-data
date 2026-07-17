import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  filterRegressionCases,
  formatRegressionCaseSummary,
  loadRegressionCorpus,
} from './corpus.js';

describe('regression corpus', () => {
  test('loads the checked-in historical cases', () => {
    const cases = loadRegressionCorpus();

    expect(cases.length).toBeGreaterThanOrEqual(7);
    expect(new Set(cases.map((regressionCase) => regressionCase.id)).size).toBe(
      cases.length,
    );
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pr-301-sklrt-single-loop-effect',
          role: 'positive-control',
          labels: expect.arrayContaining(['effect']),
        }),
        expect.objectContaining({
          id: 'pr-319-generic-update-scope-expansion',
          labels: expect.arrayContaining(['scope']),
        }),
        expect.objectContaining({
          id: 'pr-343-dtl-recurring-period-positive-control',
          role: 'positive-control',
        }),
        expect.objectContaining({
          id: 'commit-757e6b-ewl-fault-location-scope',
          role: 'regression',
          labels: expect.arrayContaining(['scope', 'state-transition']),
        }),
      ]),
    );
  });

  test('separates the EWL fault location from the whole-service delay scope', () => {
    const [regressionCase] = filterRegressionCases(loadRegressionCorpus(), {
      caseId: 'commit-757e6b-ewl-fault-location-scope',
    });

    expect(regressionCase.expected.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'claim',
          presence: 'required',
          match: expect.objectContaining({
            entity: {
              type: 'service',
              serviceId: 'EWL_MAIN_E',
            },
            scopes: {
              service: [{ type: 'service.whole' }],
            },
          }),
        }),
        expect.objectContaining({
          kind: 'claim',
          presence: 'forbidden',
          match: {
            entity: {
              type: 'service',
              serviceId: 'EWL_MAIN_W',
            },
          },
        }),
      ]),
    );
  });

  test('models the closed SKLRT loop separately from the unaffected loop', () => {
    const [regressionCase] = filterRegressionCases(loadRegressionCorpus(), {
      caseId: 'pr-301-sklrt-single-loop-effect',
    });

    expect(regressionCase.expected.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'claim',
          presence: 'required',
          match: expect.objectContaining({
            entity: {
              type: 'service',
              serviceId: 'SKLRT_W_CCW',
            },
            effect: {
              service: {
                kind: 'no-service',
              },
            },
          }),
        }),
        expect.objectContaining({
          kind: 'claim',
          presence: 'forbidden',
          match: {
            entity: {
              type: 'service',
              serviceId: 'SKLRT_W_CW',
            },
          },
        }),
      ]),
    );
  });

  test('excludes BPLRT services that ended before the evidence date', () => {
    const [regressionCase] = filterRegressionCases(loadRegressionCorpus(), {
      caseId: 'pr-230-bplrt-inactive-service-selection',
    });

    expect(regressionCase.expected.assertions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'claim',
          presence: 'required',
          match: expect.objectContaining({
            entity: {
              type: 'service',
              serviceId: 'BPLRT_A',
            },
          }),
        }),
        expect.objectContaining({
          kind: 'claim',
          presence: 'required',
          match: expect.objectContaining({
            entity: {
              type: 'service',
              serviceId: 'BPLRT_B',
            },
          }),
        }),
        {
          kind: 'claim',
          presence: 'forbidden',
          match: {
            entity: {
              type: 'service',
              serviceId: 'BPLRT_C',
            },
          },
        },
      ]),
    );
  });

  test('filters by id and label', () => {
    const cases = loadRegressionCorpus();

    expect(
      filterRegressionCases(cases, {
        caseId: 'pr-319-generic-update-scope-expansion',
      }).map((regressionCase) => regressionCase.id),
    ).toEqual(['pr-319-generic-update-scope-expansion']);

    expect(
      filterRegressionCases(cases, { label: 'relevance' }).every(
        (regressionCase) => regressionCase.labels.includes('relevance'),
      ),
    ).toBe(true);
  });

  test('formats a concise list entry', () => {
    const [regressionCase] = filterRegressionCases(loadRegressionCorpus(), {
      caseId: 'pr-301-sklrt-single-loop-effect',
    });

    expect(formatRegressionCaseSummary(regressionCase)).toContain(
      'PR #301: update → update (effect)',
    );
  });

  test('rejects duplicate ids across files', () => {
    const corpusDir = mkdtempSync(join(tmpdir(), 'mrtdown-regressions-'));
    const fixture = {
      id: 'duplicate-case',
      title: 'Duplicate case',
      role: 'regression',
      labels: ['relevance'],
      source: {
        kind: 'pull-request',
        number: 1,
        url: 'https://github.com/foldaway/mrtdown-data/pull/1',
        baseRevision: '1111111',
        candidateRevision: '2222222',
        resolutionRevision: null,
      },
      input: {
        kind: 'model-evidence',
        evidence: {
          ts: '2026-01-01T00:00:00+08:00',
          text: 'Evidence',
        },
      },
      observed: {
        outcome: { kind: 'ignore' },
        assertions: [],
      },
      expected: {
        outcome: { kind: 'ignore' },
        assertions: [],
      },
      rationale: 'Test fixture.',
    };

    try {
      writeFileSync(join(corpusDir, 'a.json'), JSON.stringify(fixture));
      writeFileSync(join(corpusDir, 'b.json'), JSON.stringify(fixture));

      expect(() => loadRegressionCorpus(corpusDir)).toThrow(
        'Duplicate regression case id: duplicate-case',
      );
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });
});
