import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packagesRoot = join(repoRoot, 'packages');

const allowed = {
  core: new Set([]),
  fs: new Set(['core']),
  triage: new Set(['core', 'fs']),
  cli: new Set(['core', 'fs', 'triage']),
};

if (!existsSync(packagesRoot)) {
  console.log('No packages directory found; package boundary check skipped.');
  process.exit(0);
}

const files = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'packages/*/src/**/*.ts',
    'packages/*/src/*.ts',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter(Boolean);

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const errors = [];

for (const file of files) {
  const [, packageName] = file.split('/');
  const packageRules = allowed[packageName];
  if (!packageRules) {
    continue;
  }

  const text = readFileSync(join(repoRoot, file), 'utf8');
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    const dependency = specifier.match(/^@mrtdown\/([^/]+)/)?.[1];
    if (!dependency || dependency === packageName) {
      continue;
    }

    if (!packageRules.has(dependency)) {
      errors.push(
        `${file}: @mrtdown/${packageName} must not import @mrtdown/${dependency}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Package boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Package boundaries are valid.');
