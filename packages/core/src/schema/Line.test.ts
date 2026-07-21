import { describe, expect, it } from 'vitest';
import { LineSchema } from './Line.js';

function minimalLine() {
  return {
    id: 'NSL',
    name: {
      'en-SG': 'North-South Line',
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    type: 'mrt.high',
    color: '#d42e12',
    startedAt: '1987-11-07',
    platformDoorCount: 24,
    trainCarCounts: [6],
    serviceIds: ['NSL_MAIN_N', 'NSL_MAIN_S'],
    operators: [],
  };
}

describe('LineSchema', () => {
  it('accepts a positive platform door count for MRT lines', () => {
    expect(() => LineSchema.parse(minimalLine())).not.toThrow();
  });

  it('requires MRT lines to provide a positive platform door count', () => {
    for (const platformDoorCount of [null, 0, 12.5]) {
      expect(
        LineSchema.safeParse({ ...minimalLine(), platformDoorCount }).success,
      ).toBe(false);
    }
  });

  it('requires LRT lines to explicitly have no platform doors', () => {
    const lrt = {
      ...minimalLine(),
      id: 'BPLRT',
      type: 'lrt',
      platformDoorCount: null,
    };

    expect(() => LineSchema.parse(lrt)).not.toThrow();
    expect(LineSchema.safeParse({ ...lrt, platformDoorCount: 4 }).success).toBe(
      false,
    );
  });

  it('permits mixed train formations only for LRT lines', () => {
    expect(
      LineSchema.safeParse({ ...minimalLine(), trainCarCounts: [3, 6] })
        .success,
    ).toBe(false);

    const lrt = {
      ...minimalLine(),
      id: 'SKLRT',
      type: 'lrt',
      platformDoorCount: null,
      trainCarCounts: [1, 2],
    };

    expect(() => LineSchema.parse(lrt)).not.toThrow();
    expect(
      LineSchema.safeParse({ ...lrt, trainCarCounts: [1, 1] }).success,
    ).toBe(false);
  });
});
