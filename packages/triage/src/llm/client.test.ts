import { describe, expect, it, vi } from 'vitest';
import { isRetryableOpenAIError, runOpenAIRequestWithRetry } from './client.js';

describe('isRetryableOpenAIError', () => {
  it('treats transient statuses as retryable', () => {
    expect(isRetryableOpenAIError({ status: 408 })).toBe(true);
    expect(isRetryableOpenAIError({ status: 409 })).toBe(true);
    expect(isRetryableOpenAIError({ status: 429 })).toBe(true);
    expect(isRetryableOpenAIError({ status: 500 })).toBe(true);
  });

  it('does not retry client validation errors', () => {
    expect(isRetryableOpenAIError({ status: 400 })).toBe(false);
    expect(isRetryableOpenAIError({ status: 422 })).toBe(false);
  });
});

describe('runOpenAIRequestWithRetry', () => {
  it('retries a transient failure and returns the successful result', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      runOpenAIRequestWithRetry(request, {
        label: 'testRequest',
        initialDelayMs: 5,
        sleep,
      }),
    ).resolves.toBe('ok');

    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
    warnSpy.mockRestore();
  });

  it('uses retry-after-ms headers when available', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({
        status: 429,
        headers: { 'retry-after-ms': '123' },
      })
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      runOpenAIRequestWithRetry(request, {
        label: 'testRequest',
        sleep,
      }),
    ).resolves.toBe('ok');

    expect(sleep).toHaveBeenCalledWith(123);
    warnSpy.mockRestore();
  });

  it('caps exponential retry delays', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce('ok');
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      runOpenAIRequestWithRetry(request, {
        label: 'testRequest',
        initialDelayMs: 500,
        maxDelayMs: 750,
        sleep,
      }),
    ).resolves.toBe('ok');

    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 750);
    expect(sleep).toHaveBeenNthCalledWith(3, 750);
    warnSpy.mockRestore();
  });

  it('does not retry non-retryable failures', async () => {
    const request = vi.fn<() => Promise<string>>().mockRejectedValue({
      status: 400,
    });
    const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      runOpenAIRequestWithRetry(request, {
        label: 'testRequest',
        sleep,
      }),
    ).rejects.toEqual({ status: 400 });

    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
