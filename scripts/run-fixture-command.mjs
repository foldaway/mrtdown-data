import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFixtures } from './generate-fixtures.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedTempRoot = resolve(repoRoot, 'fixtures/generated/tmp');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function usage() {
  return `Usage:
  node scripts/run-fixture-command.mjs [--build <workspace>]... -- <command> [args...]
`;
}

function parseArgs(argv) {
  const builds = [];
  const args = [...argv];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') {
      return { builds, command: [], help: true };
    }

    if (arg === '--') {
      return { builds, command: args };
    }

    if (arg !== '--build') {
      throw new Error(`Unknown option: ${arg}`);
    }

    const workspace = args.shift();
    if (!workspace || workspace.startsWith('--')) {
      throw new Error('--build requires a workspace name');
    }
    builds.push(workspace);
  }

  throw new Error('Missing command after --');
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: 'inherit',
  });

  const code = await new Promise((resolveCode, reject) => {
    child.on('error', reject);
    child.on('close', resolveCode);
  });

  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${code}`);
  }
}

const { builds, command, help } = parseArgs(process.argv.slice(2));
if (help) {
  console.log(usage().trimEnd());
  process.exit(0);
}

if (command.length === 0) {
  throw new Error('Missing command after --');
}

await mkdir(generatedTempRoot, { recursive: true });
const tempRoot = await mkdtemp(resolve(generatedTempRoot, 'test-'));
const env = {
  ...process.env,
  MRTDOWN_FIXTURE_DATA_DIR: resolve(tempRoot, 'data'),
  MRTDOWN_FIXTURE_META_PATH: resolve(tempRoot, 'meta.json'),
};

try {
  await generateFixtures({
    dataDir: env.MRTDOWN_FIXTURE_DATA_DIR,
    metaPath: env.MRTDOWN_FIXTURE_META_PATH,
  });

  for (const workspace of builds) {
    await run(npmCommand, ['--workspace', workspace, 'run', 'build'], {
      cwd: repoRoot,
      env,
    });
  }

  const executable = command[0] === 'npm' ? npmCommand : command[0];
  await run(executable, command.slice(1), { env });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
