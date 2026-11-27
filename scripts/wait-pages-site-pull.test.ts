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
  it('bounds request polling and sleeps by the elapsed-time deadline', async () => {
    let time = 0;
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        response({ workflowRunId: 'wfr_test', state: 'RUN_STARTED' }),
      );
    await expect(
      waitForSitePull({
        ...options,
        fetcher,
        timeoutMs: 15000,
        now: () => time,
        sleep: async (ms: number) => {
          time += ms;
        },
      }),
    ).rejects.toThrow(/Timed out/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(time).toBe(15000);
  });

  it('retries transient transport and server failures without accepting an unverified completion', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
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
    await expect(
      waitForSitePull({ ...options, fetcher }),
    ).resolves.toMatchObject({
      state: 'RUN_SUCCESS',
      combinedReleaseIndex: index,
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    await expect(
      waitForSitePull({
        ...options,
        attempts: 2,
        fetcher: async () => {
          throw new DOMException('Timed out', 'TimeoutError');
        },
      }),
    ).rejects.toThrow(/Timed out/);
  });

  it('fails closed on malformed status even after a retryable response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('not JSON'));
    await expect(waitForSitePull({ ...options, fetcher })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
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

  it('retries only the reviewed desired release after an unfinished publication', async () => {
    const desiredIndex = { ...index, releaseSha256: 'c'.repeat(64) };
    await expect(
      assertPublishedBaseline(
        index,
        async () => response({ ...index, releaseSha256: 'd'.repeat(64) }),
        desiredIndex,
      ),
    ).rejects.toThrow(/unfinished/);
    await expect(
      assertPublishedBaseline(index, async () => response(index), desiredIndex),
    ).resolves.toBe('completed');
    await expect(
      assertPublishedBaseline(
        index,
        async () => response(desiredIndex),
        desiredIndex,
      ),
    ).resolves.toBe('desired-pending');
    await expect(
      assertPublishedBaseline(index, async () => response(desiredIndex)),
    ).rejects.toThrow(/unfinished/);
  });
});
