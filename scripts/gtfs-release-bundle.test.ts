import { zipSync } from 'fflate';
import { expect, test } from 'vitest';
import { rebuildRetainedBundle } from './gtfs-release-bundle.mjs';
import { deterministicZip, objectDescriptor } from './gtfs-release-inputs.mjs';

const files = {
  'manifest.json': Buffer.from('{"fixture":true}'),
  'timetable.json': Buffer.from('synthetic timetable'),
};

test('reuses the normalized ready ZIP exactly', () => {
  const expected = deterministicZip(files);
  expect(
    rebuildRetainedBundle(files, objectDescriptor('bundles', expected, 'zip')),
  ).toEqual(expected);
});

test.each([
  -720, -480, 0, 345, 840,
])('restores legacy fixed-epoch ZIP metadata at offset %s', (minutes) => {
  const date = new Date(Date.UTC(2000, 0, 1, 0, minutes));
  const local = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
  );
  const expected = Buffer.from(zipSync(files, { level: 9, mtime: local }));
  expect(
    rebuildRetainedBundle(files, objectDescriptor('bundles', expected, 'zip')),
  ).toEqual(expected);
});

test('rejects changed content and unsupported metadata instead of weakening digest verification', () => {
  const expected = deterministicZip(files);
  expect(() =>
    rebuildRetainedBundle(
      { ...files, 'timetable.json': Buffer.from('changed timetable') },
      objectDescriptor('bundles', expected, 'zip'),
    ),
  ).toThrow(/cannot be reproduced/);
  const unsupported = Buffer.from(
    zipSync(files, { level: 9, mtime: new Date(2026, 0, 1) }),
  );
  expect(() =>
    rebuildRetainedBundle(
      files,
      objectDescriptor('bundles', unsupported, 'zip'),
    ),
  ).toThrow(/cannot be reproduced/);
});
