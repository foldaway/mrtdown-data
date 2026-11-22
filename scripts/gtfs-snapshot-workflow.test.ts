import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-review-workflow-'));
  directories.push(root);
  const repo = join(root, 'repo');
  const runner = join(root, 'runner');
  const bin = join(root, 'bin');
  await Promise.all([repo, runner, bin].map((path) => mkdir(path)));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '--bare', join(root, 'remote.git'));
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  await writeFile(join(repo, 'README.md'), 'Test repository\n');
  await mkdir(join(repo, 'scripts'));
  await copyFile(
    resolve('scripts/gtfs-review-pr-body.mjs'),
    join(repo, 'scripts/gtfs-review-pr-body.mjs'),
  );
  git('add', 'README.md', 'scripts/gtfs-review-pr-body.mjs');
  git('commit', '-m', 'test: seed');
  git('remote', 'add', 'origin', join(root, 'remote.git'));
  const sha256 = 'a'.repeat(64);
  const record = `docs/gtfs/captures/${sha256}.md`;
  const reviewDir = join(runner, 'gtfs-review');
  await mkdir(reviewDir);
  const gh = join(bin, 'gh');
  await writeFile(
    gh,
    `#!/bin/bash
set -euo pipefail
if [[ "$1" == api ]]; then
  if [[ -f "$RUNNER_TEMP/existing-pr" ]]; then cat "$RUNNER_TEMP/existing-pr"; fi
elif [[ "$1" == pr && "$2" == view ]]; then
  if [[ -f "$RUNNER_TEMP/pr-state" ]]; then cat "$RUNNER_TEMP/pr-state"; else echo CLOSED; fi
elif [[ "$1" == pr && ( "$2" == create || "$2" == edit ) ]]; then
  for body in "$@"; do :; done
  cp "$body" "$RUNNER_TEMP/created-body.md"
else
  exit 1
fi
`,
  );
  await chmod(gh, 0o755);
  const yaml = await readFile(
    resolve('.github/workflows/gtfs-capture.yml'),
    'utf8',
  );
  const step = yaml.split('      - name: Open snapshot review\n')[1];
  const script = step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    RUNNER_TEMP: runner,
    GH_TOKEN: 'test',
    GITHUB_REPOSITORY: 'example/repo',
    GITHUB_REPOSITORY_OWNER: 'example',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '123',
    BASE_BRANCH: 'main',
    SNAPSHOT_ORIGIN: 'https://sources.example.com',
    SNAPSHOT_SHA256: sha256,
    RETRIEVED_AT: '2026-11-19T20:00:00Z',
    INDEPENDENT_OUTCOME: 'failure',
    INSPECTION_OUTCOME: 'success',
    ARTIFACT_URL: '',
    REVIEW_DIR: reviewDir,
    AUTOMATIC_REPORT: join(runner, 'automatic-publication.md'),
    AUTOMATIC_RESULT: 'skipped',
  };
  const run = () =>
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: repo,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return { root, runner, repo, sha256, record, reviewDir, git, run };
}

test('publishes the durable report, retries from committed evidence, and preserves closed PRs', async () => {
  const h = await harness();
  const markdown = '# Snapshot\n\nReviewed evidence\n';
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), markdown);
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  h.run();
  const firstBody = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(firstBody).toContain(markdown);
  expect(firstBody).toContain(
    `https://github.com/example/repo/blob/${h.git('rev-parse', 'HEAD').trim()}/${h.record}`,
  );
  expect(h.git('show', `HEAD:${h.record}`)).toBe(markdown);
  expect(h.git('show', '--format=%B', '--no-patch', 'HEAD')).toContain(
    'Co-Authored-By: Codex <noreply@openai.com>',
  );
  // A pushed branch with no PR is recovered using its original committed report.
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), '# Different attempt\n');
  h.run();
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toBe(
    firstBody,
  );
  await writeFile(
    join(h.runner, 'existing-pr'),
    'https://github.com/example/repo/pull/1\n',
  );
  expect(h.run()).toContain('Snapshot review already closed');
});

test('updates an open exception PR with the current automatic hold while preserving source evidence', async () => {
  const h = await harness();
  const markdown = '# Snapshot\n\nOriginal evidence\n';
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), markdown);
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  h.run();
  const commit = h.git('rev-parse', 'HEAD');
  await writeFile(
    join(h.runner, 'existing-pr'),
    'https://github.com/example/repo/pull/1\n',
  );
  await writeFile(join(h.runner, 'pr-state'), 'OPEN\n');
  await writeFile(
    join(h.runner, 'automatic-publication.md'),
    '## Automatic publication\n\nDecision: **hold**. Calendar exceptions changed.\n',
  );
  h.run();
  const body = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(body).toContain('Decision: **hold**');
  expect(body).toContain('Original evidence');
  expect(body).toContain('https://github.com/example/repo/actions/runs/123');
  expect(h.git('rev-parse', 'HEAD')).toBe(commit);
});

test('oversized committed reports create bounded PR bodies and remain recoverable on retry', async () => {
  const h = await harness();
  const markdown = `# Snapshot\n\n${'Detailed retained evidence.\n'.repeat(5000)}End of the complete report.\n`;
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), markdown);
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  h.run();
  const body = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(Array.from(body).length).toBeLessThanOrEqual(60_000);
  expect(body).toContain('description is shortened');
  expect(body).toContain(
    `https://github.com/example/repo/blob/${h.git('rev-parse', 'HEAD').trim()}/${h.record}`,
  );
  expect(h.git('show', `HEAD:${h.record}`)).toBe(markdown);
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), '# Different retry\n');
  h.run();
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toBe(body);
});

test('missing summary artifacts still produce a PR explaining the missing comparison', async () => {
  const h = await harness();
  h.run();
  const body = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(body).toContain('**Comparison and findings summary unavailable:**');
  expect(body).toContain('Independent validator result `failure`');
  expect(body).toContain(
    'mapping approval and timetable publication remain separate',
  );
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    `${h.sha256}.json`,
  );
});
