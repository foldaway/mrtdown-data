import { describe, expect, it } from 'vitest';
import type { ReconciliationTarget } from './reconciliation.js';
import { partitionScopedCandidates } from './scopedCandidates.js';

const oldTarget: ReconciliationTarget = {
  kind: 'serviceRevision',
  id: 'MAIN',
  revisionId: 'old',
  match: 'contiguousSegment',
};
const newTarget: ReconciliationTarget = {
  kind: 'serviceRevision',
  id: 'BRANCH',
  revisionId: 'new',
  match: 'contiguousSegment',
};

describe('GTFS service-date candidate partitions', () => {
  it('covers opposite sides of a revision boundary without selecting a latest revision', () => {
    const result = partitionScopedCandidates(
      ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13'],
      [
        { target: oldTarget, serviceDates: ['2026-07-10', '2026-07-11'] },
        { target: newTarget, serviceDates: ['2026-07-12', '2026-07-13'] },
      ],
    );
    expect(result).toMatchObject({
      activeDateCount: 4,
      uniqueDateCount: 4,
      uncoveredDateCount: 0,
      ambiguousDateCount: 0,
      generationEligible: false,
    });
    expect(result.scopes).toEqual([
      {
        startDate: '2026-07-10',
        endDateExclusive: '2026-07-12',
        serviceDates: ['2026-07-10', '2026-07-11'],
        candidates: [oldTarget],
        status: 'unique',
      },
      {
        startDate: '2026-07-12',
        endDateExclusive: '2026-07-14',
        serviceDates: ['2026-07-12', '2026-07-13'],
        candidates: [newTarget],
        status: 'unique',
      },
    ]);
  });
  it('retains gaps and every overlapping candidate, even when a later revision exists', () => {
    const result = partitionScopedCandidates(
      ['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13'],
      [
        { target: oldTarget, serviceDates: ['2026-07-10', '2026-07-12'] },
        { target: newTarget, serviceDates: ['2026-07-12', '2026-07-13'] },
      ],
    );
    expect(result).toMatchObject({
      uniqueDateCount: 2,
      uncoveredDateCount: 1,
      ambiguousDateCount: 1,
    });
    expect(
      result.scopes.map((scope) => ({
        status: scope.status,
        dates: scope.serviceDates,
        candidateCount: scope.candidates.length,
      })),
    ).toEqual([
      { status: 'unique', dates: ['2026-07-10'], candidateCount: 1 },
      { status: 'gap', dates: ['2026-07-11'], candidateCount: 0 },
      { status: 'ambiguous', dates: ['2026-07-12'], candidateCount: 2 },
      { status: 'unique', dates: ['2026-07-13'], candidateCount: 1 },
    ]);
  });
  it('uses exact active date lists across calendar gaps rather than inventing service', () => {
    const dates = ['2026-07-10', '2026-07-13'];
    const result = partitionScopedCandidates(dates, [
      { target: newTarget, serviceDates: dates },
    ]);
    expect(result.scopes).toHaveLength(1);
    expect(result.scopes[0]?.serviceDates).toEqual(dates);
    expect(result.activeDateCount).toBe(2);
    expect(partitionScopedCandidates([], [])).toMatchObject({
      activeDateCount: 0,
      scopes: [],
      generationEligible: false,
    });
  });
  it('is byte deterministic under date, candidate and target-property reordering', () => {
    const dates = ['2026-07-10', '2026-07-12'];
    const original = partitionScopedCandidates(dates, [
      { target: oldTarget, serviceDates: dates },
      { target: newTarget, serviceDates: dates },
    ]);
    const reordered = partitionScopedCandidates(dates.toReversed(), [
      {
        target: Object.fromEntries(
          Object.entries(newTarget).reverse(),
        ) as ReconciliationTarget,
        serviceDates: dates.toReversed(),
      },
      {
        target: Object.fromEntries(
          Object.entries(oldTarget).reverse(),
        ) as ReconciliationTarget,
        serviceDates: dates.toReversed(),
      },
    ]);
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(original));
  });
  it('rejects invalid, duplicate or out-of-calendar dates and duplicate candidate identities', () => {
    expect(() => partitionScopedCandidates(['2026-02-30'], [])).toThrow(
      'Invalid scoped service date',
    );
    expect(() =>
      partitionScopedCandidates(['2026-07-10', '2026-07-10'], []),
    ).toThrow('Duplicate active');
    expect(() =>
      partitionScopedCandidates(
        ['2026-07-10'],
        [{ target: oldTarget, serviceDates: ['2026-07-11'] }],
      ),
    ).toThrow('outside the active');
    expect(() =>
      partitionScopedCandidates(
        ['2026-07-10'],
        [{ target: oldTarget, serviceDates: ['2026-07-10', '2026-07-10'] }],
      ),
    ).toThrow('Duplicate candidate service date');
    expect(() =>
      partitionScopedCandidates(
        ['2026-07-10'],
        [
          { target: oldTarget, serviceDates: [] },
          { target: { ...oldTarget }, serviceDates: ['2026-07-10'] },
        ],
      ),
    ).toThrow('Duplicate scoped candidate target');
  });
});
