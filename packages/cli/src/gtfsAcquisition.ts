import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CaptureSchema, hashBytes } from '@mrtdown/fs';

// The online acquisition boundary materializes files; the inspector remains offline.
export async function acquirePublicGtfsCapture(
  baseUrl: string,
  captureKey: string,
  outputDir: string,
  fetcher: typeof fetch = fetch,
) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    throw new Error('GTFS snapshot base must be an HTTPS origin');
  }
  if (!/^captures\/schedule\/[a-f0-9]{64}\.json$/.test(captureKey)) {
    throw new Error('Expected a content-addressed schedule capture key');
  }
  async function download(key: string, limit: number): Promise<Uint8Array> {
    const response = await fetcher(new URL(key, base), {
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`Snapshot download failed: HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Snapshot download is empty');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit)
          throw new Error('Snapshot download exceeds size limit');
        chunks.push(chunk.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  const capture = CaptureSchema.parse(
    JSON.parse(new TextDecoder().decode(await download(captureKey, 64 * 1024))),
  );
  if (
    capture.feed_kind !== 'schedule' ||
    captureKey !== `captures/schedule/${capture.sha256}.json` ||
    capture.archive_ref !== `blobs/schedule/${capture.sha256}.zip`
  ) {
    throw new Error('Public capture identity does not match its object keys');
  }
  if (
    capture.source !==
      'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain' ||
    capture.rights_status !== 'redistribution_permitted'
  ) {
    throw new Error(
      'Public schedule capture lacks expected source or publication status',
    );
  }
  if (capture.byte_length > 32 * 1024 * 1024)
    throw new Error('Capture exceeds download limit');
  const bytes = await download(capture.archive_ref, capture.byte_length);
  if (
    bytes.length !== capture.byte_length ||
    hashBytes(bytes) !== capture.sha256
  )
    throw new Error('Public snapshot hash or size mismatch');
  await mkdir(outputDir);
  const file = join(outputDir, 'schedule.zip');
  const handoff = join(outputDir, 'capture.json');
  // Both downloads are verified before writing any local inputs.
  try {
    await writeFile(file, bytes, { flag: 'wx' });
    await writeFile(handoff, `${JSON.stringify(capture, null, 2)}\n`, {
      flag: 'wx',
    });
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
  return { file, handoff };
}
