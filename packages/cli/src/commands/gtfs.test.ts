import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../index.js';

describe('GTFS CLI', () => {
  it('writes a verified offline report and rejects unknown arguments without writing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mrtdown-gtfs-cli-'));
    try {
      // Header-only GTFS 2.0 protobuf, no entities.
      const bytes = Buffer.from([10, 5, 10, 3, 50, 46, 48]);
      await writeFile(join(dir, 'feed.pb'), bytes);
      await writeFile(
        join(dir, 'capture.json'),
        JSON.stringify({
          schema_version: 1,
          capture_id: 'test',
          feed_kind: 'trip_updates',
          source:
            'https://datamall2.mytransport.sg/ltaodataservice/GTFSRealtimeTrainTripUpdates',
          retrieved_at: '2026-10-12T12:00:00Z',
          provider_timestamp: null,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          byte_length: bytes.length,
          archive_ref: 'synthetic/feed.pb',
          attribution: 'Synthetic',
          rights_status: 'pending_review',
          licence_reference: 'https://example.com',
        }),
      );
      const messages: string[] = [];
      const io = {
        stdout: (text: string) => messages.push(text),
        stderr: (text: string) => messages.push(text),
      };
      const args = [
        'gtfs',
        'inspect',
        '--file',
        'feed.pb',
        '--capture',
        'capture.json',
        '--write',
        'report.json',
      ];
      expect(await runCli(args, io, dir)).toBe(0);
      expect(
        JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')).realtime
          .entityCount,
      ).toBe(0);
      expect(await runCli([...args, '--unexpected'], io, dir)).toBe(1);
      expect(messages.at(-1)).toContain('Unexpected GTFS');
      expect(
        await runCli(['gtfs', 'inspect', '--file', 'feed.pb'], io, dir),
      ).toBe(1);
      expect(messages.at(-1)).toContain('--capture is required');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('fails topology fingerprinting for an empty data directory', async () => {
    const errors: string[] = [];
    expect(
      await runCli(
        ['gtfs', 'topology', '--data-dir', '/tmp/nonexistent-mrtdown-topology'],
        { stdout: () => {}, stderr: (text) => errors.push(text) },
      ),
    ).toBe(1);
    expect(errors[0]).toContain('Canonical topology requires');
  });
});
