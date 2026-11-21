import { describe, expect, it, vi } from 'vitest';
import { assertPublishedBaseline } from './acquire-current-gtfs-release.mjs';
import { waitForSitePull } from './wait-pages-site-pull.mjs';

const index = { manifestSha256: 'a'.repeat(64), releaseSha256: 'b'.repeat(64) };
const response = (value: unknown) => new Response(JSON.stringify(value));
const options = {
  url: 'https://www.mrtdown.org/internal/api/tasks/pull',
  token: 'synthetic',
  workflowRunId: 'wfr_test',
  expectedIndex: index,
  sleep: vi.fn().mockResolvedValue(undefined),
};

describe('publication completion', () => {
  it('waits past enqueueing and processing until the exact import succeeds', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ workflowRunId: 'wfr_test', state: 'PENDING' }),
      )
      .mockResolvedValueOnce(
        response({ workflowRunId: 'wfr_test', state: 'RUN_STARTED' }),
      )
      .mockResolvedValueOnce(
        response({
          workflowRunId: 'wfr_test',
          state: 'RUN_SUCCESS',
          combinedReleaseIndex: index,
        }),
      );
    expect((await waitForSitePull({ ...options, fetcher })).state).toBe(
      'RUN_SUCCESS',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    'RUN_FAILED',
    'RUN_CANCELED',
    'UNKNOWN',
  ])('fails for %s', async (state) => {
    await expect(
      waitForSitePull({
        ...options,
        fetcher: async () => response({ workflowRunId: 'wfr_test', state }),
      }),
    ).rejects.toThrow();
  });

  it('rejects unrelated successful runs and releases', async () => {
    for (const receipt of [
      {
        workflowRunId: 'other',
        state: 'RUN_SUCCESS',
        combinedReleaseIndex: index,
      },
      {
        workflowRunId: 'wfr_test',
        state: 'RUN_SUCCESS',
        combinedReleaseIndex: { ...index, manifestSha256: 'c'.repeat(64) },
      },
      { workflowRunId: 'wfr_test', state: 'RUN_SUCCESS' },
    ])
      await expect(
        waitForSitePull({ ...options, fetcher: async () => response(receipt) }),
      ).rejects.toThrow();
  });

  it('fails on authentication errors, redirects and timeout rather than advancing the baseline', async () => {
    await expect(
      waitForSitePull({
        ...options,
        fetcher: async () => new Response('', { status: 401 }),
      }),
    ).rejects.toThrow(/401/);
    await expect(
      waitForSitePull({
        ...options,
        fetcher: async () => new Response('', { status: 302 }),
      }),
    ).rejects.toThrow(/302/);
    await expect(
      waitForSitePull({
        ...options,
        attempts: 2,
        fetcher: async () =>
          response({ workflowRunId: 'wfr_test', state: 'RUN_STARTED' }),
      }),
    ).rejects.toThrow(/Timed out/);
  });

  it('halts after an unfinished or external publication instead of deploying the old baseline', async () => {
    await expect(
      assertPublishedBaseline(index, async () =>
        response({ ...index, releaseSha256: 'c'.repeat(64) }),
      ),
    ).rejects.toThrow(/unfinished/);
    await expect(
      assertPublishedBaseline(index, async () => response(index)),
    ).resolves.toBeUndefined();
  });
});
