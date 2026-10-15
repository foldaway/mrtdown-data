import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { auditRealtime } from '../packages/fs/dist/gtfs/realtime.js';
import { hashBytes, inspectGtfsDirectory } from '../packages/fs/dist/index.js';

const [schedule, alerts, updates, output] = process.argv.slice(2);
if (!schedule || !alerts || !updates || !output) {
  throw new Error(
    'Usage: node scripts/audit-gtfs-historical.mjs <schedule-directory> <alerts.pb> <updates.pb> <new-output-directory>',
  );
}
// Never overwrite a previous audit or manufacture a crawler receipt for supplied files.
await mkdir(output);
const scheduleReport = await inspectGtfsDirectory(
  schedule,
  new URL('../docs/gtfs-historical-schedule-manifest.json', import.meta.url),
);
await writeFile(
  join(output, 'schedule-report.json'),
  `${JSON.stringify(scheduleReport, null, 2)}\n`,
);
const files = {};
for (const name of Object.keys(scheduleReport.manifest)) {
  const bytes = await readFile(join(schedule, name));
  if (hashBytes(bytes) !== scheduleReport.manifest[name])
    throw new Error(`Table changed while repacking: ${name}`);
  files[name] = bytes;
}
// This is an audit-only repack, not the unavailable original download archive.
const repack = zipSync(files, {
  level: 9,
  mtime: new Date(2000, 0, 1, 0, 0, 0),
});
await writeFile(join(output, 'schedule-repacked.zip'), repack);
await writeFile(
  join(output, 'repack.json'),
  `${JSON.stringify({ schemaVersion: 1, sourceManifestSha256: scheduleReport.input.manifestSha256, sha256: hashBytes(repack), byteLength: repack.length, compression: 'fflate ZIP level 9, nominal ZIP mtime 2000-01-01 00:00:00' }, null, 2)}\n`,
);
for (const [file, kind, sha256] of [
  [
    alerts,
    'service_alerts',
    '63f054a690fa6d0358487af32572d68141cb091683ab193586e55d4638915e02',
  ],
  [
    updates,
    'trip_updates',
    '198dbfb4d4a9cdb537d83862b940e93f549a3f3d9d7f26d5f12952537709e597',
  ],
]) {
  const bytes = await readFile(file);
  if (hashBytes(bytes) !== sha256)
    throw new Error(`Historical ${kind} SHA-256 mismatch`);
  const report = {
    reportVersion: 1,
    input: { kind, sha256, byteLength: bytes.length },
    realtime: auditRealtime(bytes, kind),
  };
  await writeFile(
    join(output, `${kind}-report.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (scheduleReport.schedule.structuralErrors.length) process.exitCode = 1;
