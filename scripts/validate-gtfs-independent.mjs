import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const [jar, input, output, java = 'java'] = process.argv.slice(2);
if (!jar || !input || !output) {
  throw new Error(
    'Usage: node scripts/validate-gtfs-independent.mjs <jar> <zip> <new-output-directory> [java]',
  );
}
const lockBytes = await readFile(
  new URL('./gtfs-validator-lock.json', import.meta.url),
);
const lock = JSON.parse(lockBytes);
if (digest(await readFile(jar)) !== lock.sha256) {
  throw new Error('Validator JAR SHA-256 does not match the lock');
}
const runtime = spawnSync(java, ['-version'], { encoding: 'utf8' });
if (runtime.status !== 0 || !/version "17\./.test(runtime.stderr)) {
  throw new Error('Pinned validator requires Java 17');
}
const inputBytes = await readFile(input);
await mkdir(output); // Refuse to mix findings with a previous run.
const args = [
  '-jar',
  resolve(jar),
  '--input',
  resolve(input),
  '--output_base',
  resolve(output),
  ...lock.arguments,
];
const result = spawnSync(java, args, {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
await writeFile(
  resolve(output, 'invocation.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      validatorLockSha256: digest(lockBytes),
      validator: lock,
      inputSha256: digest(inputBytes),
      inputBytes: inputBytes.length,
      javaVersion: runtime.stderr.trim(),
      invocation: [java, ...args],
      exitCode: result.status,
      executionError: result.error?.message ?? null,
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  resolve(output, 'execution.log'),
  `${result.stdout ?? ''}${result.stderr ?? ''}`,
);
if (result.error || result.status !== 0) {
  throw new Error(`Independent validator failed; see ${output}/execution.log`);
}
// A successful process is not proof of a valid feed. Require its findings file.
const report = JSON.parse(
  await readFile(resolve(output, 'report.json'), 'utf8'),
);
const systemErrors = JSON.parse(
  await readFile(resolve(output, 'system_errors.json'), 'utf8'),
);
if (!Array.isArray(report.notices) || !Array.isArray(systemErrors.notices)) {
  throw new Error('Independent validator returned an unexpected report format');
}
if (
  systemErrors.notices.length ||
  report.notices.some((notice) => notice.severity === 'ERROR')
) {
  throw new Error(`Independent validation found errors; see ${output}`);
}
console.log(
  `Independent findings saved to ${output}; review report.json and system_errors.json`,
);
