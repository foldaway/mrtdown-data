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
await mkdir(output); // Refuse to overwrite provenance from a previous run.
const provenance = {
  schemaVersion: 1,
  validatorLockSha256: digest(lockBytes),
  validator: lock,
  observedJarSha256: null,
  inputSha256: null,
  inputBytes: null,
  javaVersion: null,
  invocation: null,
  exitCode: null,
  stage: 'jar-preflight',
  executionError: null,
};
let executionLog = '';
try {
  provenance.observedJarSha256 = digest(await readFile(jar));
  if (provenance.observedJarSha256 !== lock.sha256) {
    throw new Error('Validator JAR SHA-256 does not match the lock');
  }
  provenance.stage = 'java-preflight';
  const runtime = spawnSync(java, ['-version'], { encoding: 'utf8' });
  provenance.javaVersion =
    `${runtime.stdout ?? ''}${runtime.stderr ?? ''}`.trim();
  executionLog += provenance.javaVersion;
  if (
    runtime.error ||
    runtime.status !== 0 ||
    !/version "17\./.test(provenance.javaVersion)
  ) {
    throw new Error('Pinned validator requires Java 17', {
      cause: runtime.error,
    });
  }
  provenance.stage = 'input-preflight';
  const inputBytes = await readFile(input);
  provenance.inputSha256 = digest(inputBytes);
  provenance.inputBytes = inputBytes.length;
  const args = [
    '-jar',
    resolve(jar),
    '--input',
    resolve(input),
    '--output_base',
    resolve(output),
    ...lock.arguments,
  ];
  provenance.invocation = [java, ...args];
  provenance.stage = 'validation';
  const result = spawnSync(java, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  provenance.exitCode = result.status;
  executionLog += `\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    throw new Error(
      `Independent validator failed; see ${output}/execution.log`,
      { cause: result.error },
    );
  }
  provenance.stage = 'reports';
  // A successful process is not proof of a valid feed. Require its findings file.
  const report = JSON.parse(
    await readFile(resolve(output, 'report.json'), 'utf8'),
  );
  const systemErrors = JSON.parse(
    await readFile(resolve(output, 'system_errors.json'), 'utf8'),
  );
  if (!Array.isArray(report.notices) || !Array.isArray(systemErrors.notices)) {
    throw new Error(
      'Independent validator returned an unexpected report format',
    );
  }
  if (
    systemErrors.notices.length ||
    report.notices.some((notice) => notice.severity === 'ERROR')
  ) {
    throw new Error(`Independent validation found errors; see ${output}`);
  }

  provenance.stage = 'complete';
} catch (error) {
  provenance.executionError = error.message;
  executionLog += `\n${error.stack}\n`;
  throw error;
} finally {
  await writeFile(
    resolve(output, 'invocation.json'),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  await writeFile(resolve(output, 'execution.log'), executionLog);
}
console.log(
  `Independent findings saved to ${output}; review report.json and system_errors.json`,
);
