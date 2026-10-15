import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  it('writes invalid directory audit reports with failure status and rejects mixed provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mrtdown-directory-cli-'));
    try {
      await mkdir(join(root, 'schedule'));
      const tables = {
        'agency.txt':
          'agency_id,agency_name,agency_url,agency_timezone\nA,Test,https://example.com,Asia/Singapore\n',
        'routes.txt': 'route_id,agency_id,route_type\nR,A,1\n',
        'stops.txt': 'stop_id,stop_name\nS,Stop\n',
        'trips.txt': 'route_id,service_id,trip_id\nUNKNOWN,C,T\n',
        'stop_times.txt':
          'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT,8:00:00,8:00:00,S,1\n',
        'calendar_dates.txt': 'service_id,date,exception_type\nC,20261014,1\n',
      };
      for (const [name, text] of Object.entries(tables))
        await writeFile(join(root, 'schedule', name), text);
      await writeFile(
        join(root, 'manifest.json'),
        JSON.stringify(
          Object.fromEntries(
            Object.entries(tables).map(([name, text]) => [
              name,
              createHash('sha256').update(text).digest('hex'),
            ]),
          ),
        ),
      );
      const messages: string[] = [];
      const io = {
        stdout: () => {},
        stderr: (text: string) => messages.push(text),
      };
      const args = [
        'gtfs',
        'inspect',
        '--directory',
        'schedule',
        '--manifest',
        'manifest.json',
        '--write',
        'report.json',
      ];
      expect(await runCli(args, io, root)).toBe(1);
      const report = JSON.parse(
        await readFile(join(root, 'report.json'), 'utf8'),
      );
      expect(report.input.kind).toBe('schedule_directory');
      expect(report.schedule.structuralErrors).toContain(
        'trip T: unknown route UNKNOWN',
      );
      expect(await runCli([...args, '--file', 'feed.zip'], io, root)).toBe(1);
      expect(messages.at(-1)).toContain('Use --directory');
      expect(
        await runCli(['gtfs', 'inspect', '--directory', 'schedule'], io, root),
      ).toBe(1);
      expect(messages.at(-1)).toContain('--manifest is required');
    } finally {
      await rm(root, { recursive: true, force: true });
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
