import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashBytes } from './capture.js';
import { inspectGtfsDirectory } from './directory.js';
import { auditSchedule, readScheduleFiles } from './schedule.js';

const files = {
  'agency.txt': Buffer.from(
    'agency_id,agency_name,agency_url,agency_timezone\nA,Agency,https://example.com,Asia/Singapore\n',
  ),
  'routes.txt': Buffer.from('route_id,agency_id,route_type\nR,A,1\n'),
  'stops.txt': Buffer.from('stop_id,stop_name\nS,Stop\n'),
  'trips.txt': Buffer.from('route_id,service_id,trip_id\nR,C,T\n'),
  'stop_times.txt': Buffer.from(
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT,25:00:00,25:00:00,S,1\n',
  ),
  'calendar_dates.txt': Buffer.from(
    'service_id,date,exception_type\nC,20261014,1\n',
  ),
};

describe('verified unpacked GTFS schedules', () => {
  let root: string;
  let directory: string;
  let manifestFile: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'gtfs-directory-'));
    directory = join(root, 'schedule');
    manifestFile = join(root, 'manifest.json');
    await mkdir(directory);
    await Promise.all(
      Object.entries(files).map(([name, bytes]) =>
        writeFile(join(directory, name), bytes),
      ),
    );
    await writeFile(
      manifestFile,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(files).map(([name, bytes]) => [
            name,
            hashBytes(bytes),
          ]),
        ),
      ),
    );
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('shares archive parsing and audit while recording deterministic directory provenance', async () => {
    const first = await inspectGtfsDirectory(directory, manifestFile);
    expect(first.schedule).toEqual(
      auditSchedule(readScheduleFiles(files).tables),
    );
    expect(first.schedule.structuralErrors).toEqual([]);
    expect(first.input.byteLength).toBe(
      Object.values(files).reduce((total, bytes) => total + bytes.length, 0),
    );
    const reversed = Object.fromEntries(
      Object.entries(first.manifest).reverse(),
    );
    await writeFile(manifestFile, JSON.stringify(reversed, null, 4));
    expect(await inspectGtfsDirectory(directory, manifestFile)).toEqual(first);
    expect(first).not.toHaveProperty('capture');
  });
  it('rejects altered table bytes before parsing', async () => {
    await writeFile(join(directory, 'stops.txt'), 'not,a,GTFS,table');
    await expect(inspectGtfsDirectory(directory, manifestFile)).rejects.toThrow(
      'SHA-256',
    );
  });
  it('rejects missing and extra files rather than verifying a subset', async () => {
    await writeFile(join(directory, 'extra.txt'), 'extra');
    await expect(inspectGtfsDirectory(directory, manifestFile)).rejects.toThrow(
      'file set',
    );
    await rm(join(directory, 'extra.txt'));
    await rm(join(directory, 'stops.txt'));
    await expect(inspectGtfsDirectory(directory, manifestFile)).rejects.toThrow(
      'file set',
    );
  });
  it('rejects symlinks even when their target bytes match', async () => {
    await writeFile(join(root, 'stop-target'), files['stops.txt']);
    await rm(join(directory, 'stops.txt'));
    await symlink(join(root, 'stop-target'), join(directory, 'stops.txt'));
    await expect(
      inspectGtfsDirectory(directory, manifestFile),
    ).rejects.toThrow();
  });
  it('rejects directories and manifest path traversal', async () => {
    await rm(join(directory, 'stops.txt'));
    await mkdir(join(directory, 'stops.txt'));
    await expect(inspectGtfsDirectory(directory, manifestFile)).rejects.toThrow(
      'regular GTFS table',
    );
    await writeFile(
      manifestFile,
      JSON.stringify({ '../escape.txt': '0'.repeat(64) }),
    );
    await expect(
      inspectGtfsDirectory(directory, manifestFile),
    ).rejects.toThrow();
  });
  it('enforces the expanded byte limit before loading a large table', async () => {
    await truncate(join(directory, 'agency.txt'), 256 * 1024 * 1024 + 1);
    await expect(inspectGtfsDirectory(directory, manifestFile)).rejects.toThrow(
      '256 MiB',
    );
  });
});
