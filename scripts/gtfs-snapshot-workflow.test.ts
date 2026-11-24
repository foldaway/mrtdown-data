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
  await copyFile(
    resolve('scripts/gtfs-publication-review.mjs'),
    join(repo, 'scripts/gtfs-publication-review.mjs'),
  );
  git('add', 'README.md', 'scripts');
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
  if [[ "$2" == */files ]]; then
    cat "$RUNNER_TEMP/pr-files"
  elif [[ "$2" == */runs/* ]]; then
    cat "$RUNNER_TEMP/preparation-run.json"
  elif [[ "$2" == */artifacts/* ]]; then
    cat "$RUNNER_TEMP/preparation-artifact.json"
  elif [[ -f "$RUNNER_TEMP/existing-pr" ]]; then cat "$RUNNER_TEMP/existing-pr"; fi
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
    .split(/\n(?= {0,9}\S)/)[0]
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
    PREPARED_ARTIFACT_ID: '',
  };
  const run = () =>
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: repo,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  return { root, runner, repo, sha256, record, reviewDir, git, run, env };
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
  expect(body).toContain('Merging this record retains evidence only');
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    `${h.sha256}.json`,
  );
});

test('ready reviews commit the exact request, refresh it on rerun and remove it when preparation is held', async () => {
  const h = await harness();
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Snapshot\n\nSource changes\n',
  );
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  const candidate = {
    schemaVersion: 1,
    captureSha256: h.sha256,
    manifestSha256: 'b'.repeat(64),
    predecessorManifestSha256: 'c'.repeat(64),
    contentSha256: 'd'.repeat(64),
    policySha256: 'e'.repeat(64),
    runId: '123',
  };
  const candidatePath = join(automatic, 'publication-candidate.json');
  await writeFile(candidatePath, JSON.stringify(candidate));
  h.env.PREPARED_ARTIFACT_ID = '456';
  h.run();
  const requestPath = `docs/gtfs/captures/${h.sha256}.publication.json`;
  expect(JSON.parse(h.git('show', `HEAD:${requestPath}`))).toEqual({
    ...candidate,
    artifactId: '456',
  });
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'Merging this PR authorizes deployment',
  );
  candidate.runId = '124';
  await writeFile(candidatePath, JSON.stringify(candidate));
  h.env.PREPARED_ARTIFACT_ID = '457';
  h.run();
  expect(JSON.parse(h.git('show', `HEAD:${requestPath}`))).toEqual({
    ...candidate,
    artifactId: '457',
  });
  h.env.PREPARED_ARTIFACT_ID = '';
  await rm(candidatePath);
  h.run();
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    requestPath,
  );
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'Publication is held',
  );
});

test('merged publication reads the request at the merge commit, supports rebase merges and skips evidence-only PRs', async () => {
  const h = await harness();
  const request = {
    schemaVersion: 1,
    captureSha256: h.sha256,
    manifestSha256: 'b'.repeat(64),
    predecessorManifestSha256: 'c'.repeat(64),
    contentSha256: 'd'.repeat(64),
    policySha256: 'e'.repeat(64),
    runId: '123',
    artifactId: '456',
  };
  const path = `docs/gtfs/captures/${h.sha256}.publication.json`;
  await mkdir(join(h.repo, 'docs/gtfs/captures'), { recursive: true });
  await writeFile(join(h.repo, path), JSON.stringify(request));
  h.git('add', path);
  h.git('commit', '-m', 'test: prepared request');
  // A rebase merge's last commit need not change the publication request.
  await writeFile(join(h.repo, 'README.md'), 'Changed by the last PR commit\n');
  h.git('add', 'README.md');
  h.git('commit', '-m', 'test: final rebased commit');
  const event = {
    action: 'closed',
    number: 1,
    pull_request: {
      merged: true,
      merge_commit_sha: h.git('rev-parse', 'HEAD').trim(),
      head: {
        ref: `gtfs-review/${h.sha256}`,
        repo: { full_name: 'foldaway/mrtdown-data' },
      },
      base: { ref: 'main', repo: { full_name: 'foldaway/mrtdown-data' } },
    },
  };
  await writeFile(join(h.runner, 'event.json'), JSON.stringify(event));
  await writeFile(join(h.runner, 'pr-files'), `${path}\nREADME.md\n`);
  await writeFile(
    join(h.runner, 'preparation-run.json'),
    JSON.stringify({
      id: 123,
      path: '.github/workflows/gtfs-capture.yml',
      event: 'workflow_dispatch',
      head_branch: 'main',
      head_repository: { full_name: 'foldaway/mrtdown-data' },
      conclusion: 'success',
      run_attempt: 1,
    }),
  );
  const artifact = {
    id: 456,
    name: 'gtfs-prepared-123-1',
    expired: false,
    workflow_run: { id: 123 },
  };
  await writeFile(
    join(h.runner, 'preparation-artifact.json'),
    JSON.stringify(artifact),
  );
  const output = join(h.runner, 'publication-output');
  const run = () =>
    execFileSync(
      process.execPath,
      [resolve('scripts/gtfs-publication-review.mjs'), 'merged'],
      {
        cwd: h.repo,
        env: {
          ...h.env,
          GITHUB_REPOSITORY: 'foldaway/mrtdown-data',
          GITHUB_EVENT_PATH: join(h.runner, 'event.json'),
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(h.runner, 'summary'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  // Working-tree edits cannot replace the request actually approved by the merge.
  await writeFile(
    join(h.repo, path),
    JSON.stringify({ ...request, artifactId: '999' }),
  );
  run();
  expect(await readFile(output, 'utf8')).toBe(
    `request=${JSON.stringify(request)}\n`,
  );
  await rm(output);
  await writeFile(
    join(h.runner, 'preparation-artifact.json'),
    JSON.stringify({ ...artifact, expired: true }),
  );
  expect(run).toThrow();
  expect(await readFile(output, 'utf8').catch(() => null)).toBeNull();
  await writeFile(join(h.runner, 'pr-files'), 'README.md\n');
  run();
  expect(await readFile(output, 'utf8').catch(() => null)).toBeNull();
  expect(await readFile(join(h.runner, 'summary'), 'utf8')).toContain(
    'no prepared publication request',
  );
});
