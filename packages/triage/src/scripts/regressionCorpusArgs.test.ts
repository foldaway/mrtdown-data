import { describe, expect, test } from 'vitest';
import { parseRegressionCorpusArgs } from './regressionCorpusArgs.js';

describe('parseRegressionCorpusArgs', () => {
  test('parses filters and output options', () => {
    expect(
      parseRegressionCorpusArgs([
        '--case',
        'pr-301-sklrt-single-loop-effect',
        '--label',
        'effect',
        '--json',
        '--replay',
      ]),
    ).toEqual({
      caseId: 'pr-301-sklrt-single-loop-effect',
      help: false,
      json: true,
      label: 'effect',
      replay: true,
    });
  });

  test('accepts list and help flags', () => {
    expect(parseRegressionCorpusArgs(['--list', '--help'])).toEqual({
      caseId: undefined,
      help: true,
      json: false,
      label: undefined,
      replay: false,
    });
  });

  test('rejects invalid labels and missing values', () => {
    expect(() => parseRegressionCorpusArgs(['--label', 'unknown'])).toThrow();
    expect(() => parseRegressionCorpusArgs(['--case'])).toThrow(
      'Missing value for --case',
    );
  });
});
