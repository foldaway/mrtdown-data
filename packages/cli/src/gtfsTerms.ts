import { GtfsTimetableTermsSchema, hashBytes } from '@mrtdown/fs';

export const gtfsLicenceReference =
  'https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html';
const apiTermsReference =
  'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html';
const maximumBytes = 2 * 1024 * 1024;

export async function acquireGtfsTerms(fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(30_000),
  ]);
  async function download(reference: string) {
    const response = await fetcher(reference, {
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Terms download failed: HTTP ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Terms download is empty');
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        size += value.byteLength;
        if (size > maximumBytes) {
          throw new Error('Terms download exceeds size limit');
        }
        chunks.push(value);
      }
      if (size === 0) {
        throw new Error('Terms download is empty');
      }
      return { reference, sha256: hashBytes(Buffer.concat(chunks)) };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  try {
    const [licence, apiTerms] = await Promise.all([
      download(gtfsLicenceReference),
      download(apiTermsReference),
    ]);
    return GtfsTimetableTermsSchema.parse({ licence, apiTerms });
  } finally {
    controller.abort();
  }
}
