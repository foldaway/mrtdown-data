import { constants } from 'node:fs';
import { open, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import z from 'zod';
import { hashBytes } from './capture.js';
import { auditSchedule, readScheduleFiles } from './schedule.js';

const ManifestSchema = z.record(
  z.string().regex(/^[a-z_]+\.txt$/),
  z.string().regex(/^[a-f0-9]{64}$/),
);
const expandedLimit = 256 * 1024 * 1024;

/** Verify an unpacked snapshot against an independently retained table manifest. */
export async function inspectGtfsDirectory(
  directory: string,
  manifestFile: string,
) {
  const expected = ManifestSchema.parse(
    JSON.parse(await readFile(manifestFile, 'utf8')),
  );
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(expected).sort())) {
    throw new Error('Schedule directory file set does not match the manifest');
  }
  if (entries.some((entry) => !entry.isFile())) {
    throw new Error('Expected regular GTFS table files only');
  }
  const files: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  for (const name of names) {
    // O_NOFOLLOW also rejects a symlink swapped in after directory enumeration.
    const file = await open(
      join(directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile())
        throw new Error(`Expected regular GTFS table: ${name}`);
      totalBytes += stat.size;
      if (totalBytes > expandedLimit)
        throw new Error('Schedule exceeds 256 MiB expanded limit');
      const content = await file.readFile();
      if (
        content.length !== stat.size ||
        hashBytes(content) !== expected[name]
      ) {
        throw new Error(
          `Schedule table does not match recorded SHA-256: ${name}`,
        );
      }
      files[name] = content;
    } finally {
      await file.close();
    }
  }
  const { tables, manifest } = readScheduleFiles(files);
  return {
    reportVersion: 1 as const,
    input: {
      kind: 'schedule_directory' as const,
      // Hash a normalized, sorted projection, independent of JSON formatting/paths.
      manifestSha256: hashBytes(Buffer.from(JSON.stringify(manifest))),
      byteLength: totalBytes,
    },
    manifest,
    schedule: auditSchedule(tables),
  };
}
