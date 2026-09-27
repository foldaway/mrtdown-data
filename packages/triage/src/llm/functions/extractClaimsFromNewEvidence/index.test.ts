import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractClaimsFromNewEvidence } from './index.js';

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('../../client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client.js')>()),
  getOpenAiClient: () => ({ responses: { parse: mocks.parse } }),
}));

const repo = new MRTDownRepository({
  store: new FileStore(
    resolve(process.env.MRTDOWN_FIXTURE_DATA_DIR ?? 'fixtures/generated/data'),
  ),
});

function responseWithDuration(duration: string | null) {
  return {
    id: 'resp_test',
    model: 'gpt-5.4-mini',
    status: 'completed',
    error: null,
    incomplete_details: null,
    usage: null,
    output: [],
    output_parsed: {
      claims: [
        {
          entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
          effect: { service: { kind: 'delay', duration }, facility: null },
          scopes: { service: null },
          statusSignal: 'open',
          timeHints: {
            kind: 'start-only',
            startAt: '2026-05-23T09:03:00+08:00',
          },
          causes: null,
        },
      ],
    },
  };
}

const newEvidence = {
  ts: '2026-05-23T09:03:00+08:00',
  text: 'DTL delay: add 15 minutes of travel time.',
};

describe('extractClaimsFromNewEvidence local validation', () => {
  beforeEach(() => {
    mocks.parse.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['PT15M', null])('accepts a valid duration: %s', async (duration) => {
    mocks.parse.mockResolvedValue(responseWithDuration(duration));
    const result = await extractClaimsFromNewEvidence({ repo, newEvidence });
    expect(result.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effect: { service: { kind: 'delay', duration }, facility: null },
        }),
      ]),
    );
  });

  it.each([
    '15 minutes',
    'PT',
    'P1W1D',
  ])('rejects invalid durations before normalization: %s', async (duration) => {
    mocks.parse.mockResolvedValue(responseWithDuration(duration));
    await expect(
      extractClaimsFromNewEvidence({ repo, newEvidence }),
    ).rejects.toThrow();
    expect(mocks.parse).toHaveBeenCalledOnce();
  });
});
