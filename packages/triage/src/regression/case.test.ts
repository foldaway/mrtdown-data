import { describe, expect, test } from 'vitest';
import { RegressionCaseSchema } from './case.js';

const validCase = {
  id: 'schema-test-case',
  title: 'Schema test case',
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
    outcome: {
      kind: 'create',
      issueType: 'disruption',
      issueId: '2026-01-01-observed-issue',
    },
    assertions: [],
  },
  expected: {
    outcome: { kind: 'ignore' },
    assertions: [],
  },
  rationale: 'Test fixture.',
} as const;

describe('RegressionCaseSchema', () => {
  test('requires model-evidence timestamps with an ISO offset', () => {
    expect(
      RegressionCaseSchema.safeParse({
        ...validCase,
        input: {
          ...validCase.input,
          evidence: {
            ...validCase.input.evidence,
            ts: 'not-a-timestamp',
          },
        },
      }).success,
    ).toBe(false);
  });

  test('rejects unchecked expected issue ids for create outcomes', () => {
    const result = RegressionCaseSchema.safeParse({
      ...validCase,
      expected: {
        outcome: {
          kind: 'create',
          issueType: 'disruption',
          issueId: '2026-01-01-expected-issue',
        },
        assertions: [],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'Expected create outcomes cannot specify issueId',
            path: ['expected', 'outcome', 'issueId'],
          }),
        ]),
      );
    }
  });
});
