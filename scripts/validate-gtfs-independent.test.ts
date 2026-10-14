import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('rejects an untrusted executable before launching Java or creating output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gtfs-lock-'));
  directories.push(directory);
  const jar = join(directory, 'wrong.jar');
  writeFileSync(jar, 'untrusted executable');
  const result = spawnSync(
    process.execPath,
    [
      resolve('scripts/validate-gtfs-independent.mjs'),
      jar,
      join(directory, 'missing.zip'),
      join(directory, 'output'),
      join(directory, 'missing-java'),
    ],
    { encoding: 'utf8' },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    'Validator JAR SHA-256 does not match the lock',
  );
});
test('lock fixes the validation date and disables network update checks', () => {
  const lock = JSON.parse(
    readFileSync('scripts/gtfs-validator-lock.json', 'utf8'),
  );
  expect(lock.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(lock.arguments).toEqual([
    '--country_code',
    'SG',
    '--threads',
    '1',
    '--date',
    '2026-10-14',
    '--skip_validator_update',
  ]);
  expect(lock.arguments).not.toContain('--url');
});
