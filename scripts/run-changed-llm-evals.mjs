import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const triageWorkspacePrefix = 'packages/triage/';
const functionPathPattern = /^packages\/triage\/src\/llm\/functions\/([^/]+)\//;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const range = args.find((arg) => !arg.startsWith('--'));

if (range == null) {
  console.error(
    'Usage: node scripts/run-changed-llm-evals.mjs <git-range> [--dry-run]',
  );
  process.exit(1);
}

const changedFiles = execFileSync('git', ['diff', '--name-only', range], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const evalFiles = [
  ...new Set(
    changedFiles
      .map((file) => {
        const match = functionPathPattern.exec(file);
        return match == null
          ? null
          : `packages/triage/src/llm/functions/${match[1]}/eval.test.ts`;
      })
      .filter((file) => file != null && existsSync(join(repoRoot, file))),
  ),
].sort();

if (evalFiles.length === 0) {
  console.log('No changed LLM function evals found.');
  process.exit(0);
}

console.log('Changed LLM function evals:');
for (const evalFile of evalFiles) {
  console.log(`- ${evalFile}`);
}

for (const evalFile of evalFiles) {
  const workspaceEvalFile = evalFile.startsWith(triageWorkspacePrefix)
    ? evalFile.slice(triageWorkspacePrefix.length)
    : evalFile;
  const command = [
    'npm',
    '--workspace',
    '@mrtdown/triage',
    'run',
    'test:eval',
    '--',
    workspaceEvalFile,
  ];
  console.log(`\n$ ${command.join(' ')}`);

  if (dryRun) {
    continue;
  }

  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
