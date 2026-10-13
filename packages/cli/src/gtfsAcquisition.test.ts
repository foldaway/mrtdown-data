import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBytes } from '@mrtdown/fs';
import { describe, expect, it, vi } from 'vitest';
import { acquirePublicGtfsCapture } from './gtfsAcquisition.js';

const bytes = new Uint8Array([80, 75, 3, 4]);
const hash = hashBytes(bytes);
const key = `captures/schedule/${hash}.json`;
const capture = {
  schema_version: 1,
  capture_id: 'test',
  feed_kind: 'schedule',
  source: 'https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain',
  retrieved_at: '2026-10-12T00:00:00Z',
  provider_timestamp: null,
  sha256: hash,
  byte_length: bytes.length,
  archive_ref: `blobs/schedule/${hash}.zip`,
  attribution: 'LTA DataMall',
  rights_status: 'redistribution_permitted',
  licence_reference:
    'https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html',
};
function fetcher(metadata = capture, payload = bytes) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith('.json')
        ? Response.json(metadata)
        : new Response(payload),
    );
}
describe('public schedule acquisition', () => {
  it('downloads only configured-origin objects and materializes verified inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-public-'));
    try {
      const mocked = fetcher();
      const result = await acquirePublicGtfsCapture(
        'https://snapshots.example.com',
        key,
        join(root, 'inputs'),
        mocked,
      );
      expect(await readFile(result.file)).toEqual(Buffer.from(bytes));
      expect(JSON.parse(await readFile(result.handoff, 'utf8'))).toEqual(
        capture,
      );
      expect(mocked.mock.calls.map(([url]) => String(url))).toEqual([
        `https://snapshots.example.com/${key}`,
        `https://snapshots.example.com/${capture.archive_ref}`,
      ]);
      expect(
        mocked.mock.calls.every(([, options]) => options?.redirect === 'error'),
      ).toBe(true);
      await expect(
        acquirePublicGtfsCapture(
          'https://snapshots.example.com',
          key,
          join(root, 'inputs'),
          mocked,
        ),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects arbitrary URLs, traversal, mismatched identities and corrupt bytes before materialization', async () => {
    const mocked = fetcher();
    await expect(
      acquirePublicGtfsCapture(
        'http://example.com',
        key,
        '/tmp/unused',
        mocked,
      ),
    ).rejects.toThrow('HTTPS');
    await expect(
      acquirePublicGtfsCapture(
        'https://example.com',
        '../capture.json',
        '/tmp/unused',
        mocked,
      ),
    ).rejects.toThrow('capture key');
    expect(mocked).not.toHaveBeenCalled();
    await expect(
      acquirePublicGtfsCapture(
        'https://example.com',
        key,
        '/tmp/unused',
        fetcher({ ...capture, archive_ref: 'https://evil.example.com/file' }),
      ),
    ).rejects.toThrow('object keys');
    await expect(
      acquirePublicGtfsCapture(
        'https://example.com',
        key,
        '/tmp/unused',
        fetcher(capture, new Uint8Array([0, 0, 0, 0])),
      ),
    ).rejects.toThrow('hash or size');
    await expect(
      acquirePublicGtfsCapture(
        'https://example.com',
        key,
        '/tmp/unused',
        fetcher({ ...capture, rights_status: 'pending_review' }),
      ),
    ).rejects.toThrow('publication status');
  });
});
