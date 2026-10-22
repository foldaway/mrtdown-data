import { hashBytes } from '@mrtdown/fs';
import { describe, expect, it, vi } from 'vitest';
import { acquireGtfsTerms, gtfsLicenceReference } from './gtfsTerms.js';

describe('current GTFS terms acquisition', () => {
  it('hashes the independently downloaded bytes from the fixed official URLs without cache reuse or redirects', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('Synthetic terms'));
    const result = await acquireGtfsTerms(fetcher);
    expect(result.licence.reference).toBe(gtfsLicenceReference);
    expect(result.apiTerms.reference).toBe(
      'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
    );
    expect(result.licence.sha256).toBe(
      hashBytes(Buffer.from('Synthetic terms')),
    );
    expect(result.apiTerms.sha256).toBe(result.licence.sha256);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      result.licence.reference,
      result.apiTerms.reference,
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({
        redirect: 'error',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('fails closed on redirects, HTTP errors, empty content and oversized streamed bodies', async () => {
    for (const response of [
      () => new Response('Redirect', { status: 302 }),
      () => new Response('Unavailable', { status: 503 }),
      () => new Response(''),
      () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
    ]) {
      await expect(
        acquireGtfsTerms(
          vi.fn<typeof fetch>().mockImplementation(async () => response()),
        ),
      ).rejects.toThrow(/Terms download/);
    }
  });
});
