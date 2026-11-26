import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
import { renderAutomaticPublicationReport } from './prepare-gtfs-automatic-release.mjs';

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
    resolve('scripts/merge-gtfs-noop-review.mjs'),
    join(repo, 'scripts/merge-gtfs-noop-review.mjs'),
  );
  await copyFile(
    resolve('scripts/archive-gtfs-capture-review.mjs'),
    join(repo, 'scripts/archive-gtfs-capture-review.mjs'),
  );
  git('add', 'README.md', 'scripts');
  git('commit', '-m', 'test: seed');
  git('remote', 'add', 'origin', join(root, 'remote.git'));
  git('push', 'origin', 'main');
  const sha256 = 'a'.repeat(64);
  const record = `docs/gtfs/captures/${sha256}.md`;
  const reviewDir = join(runner, 'gtfs-capture-receipt');
  await mkdir(reviewDir);
  const gh = join(bin, 'gh');
  await writeFile(
    gh,
    `#!/bin/bash
set -euo pipefail
if [[ "$1" == api ]]; then
  if [[ -f "$RUNNER_TEMP/existing-pr" ]]; then
    if [[ "$*" == *state=open* && ! -f "$RUNNER_TEMP/pr-state" ]]; then exit 0; fi
    cat "$RUNNER_TEMP/existing-pr"
  fi
elif [[ "$1" == pr && "$2" == view ]]; then
  if [[ -f "$RUNNER_TEMP/pr-state" ]]; then cat "$RUNNER_TEMP/pr-state"; else echo CLOSED; fi
elif [[ "$1" == pr && ( "$2" == create || "$2" == edit ) ]]; then
  for body in "$@"; do :; done
  cp "$body" "$RUNNER_TEMP/created-body.md"
  if [[ "$2" == create ]]; then echo https://github.com/example/repo/pull/1; fi
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
    GITHUB_RUN_ATTEMPT: '1',
    BASE_BRANCH: 'main',
    SNAPSHOT_ORIGIN: 'https://sources.example.com',
    SNAPSHOT_SHA256: sha256,
    RETRIEVED_AT: '2026-11-19T20:00:00Z',
    INDEPENDENT_OUTCOME: 'failure',
    INSPECTION_OUTCOME: 'success',
    ARTIFACT_URL: '',
    REVIEW_DIR: reviewDir,
    ARCHIVE_OUTCOME: 'success',
    AUTOMATIC_REPORT: join(runner, 'automatic-publication.md'),
    AUTOMATIC_RESULT: 'skipped',
    PREPARATION_DECISION: 'disabled',
  };
  const run = () =>
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: repo,
      env: {
        ...env,
        ARCHIVE_OUTCOME:
          env.ARCHIVE_OUTCOME === 'failure'
            ? 'failure'
            : existsSync(join(reviewDir, `${sha256}.json`)) &&
                existsSync(join(reviewDir, `${sha256}.md`))
              ? 'success'
              : 'failure',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const preserveCommand = yaml
    .split('      - name: Preserve trusted no-op merge code\n')[1]
    .split('\n')[0]
    .trim()
    .replace(/^run: /, '');
  const preserve = (sha: string) =>
    execFileSync('bash', ['-e', '-c', preserveCommand], {
      cwd: repo,
      env: { ...env, GITHUB_SHA: sha },
      encoding: 'utf8',
    });
  return {
    root,
    runner,
    repo,
    sha256,
    record,
    reviewDir,
    git,
    run,
    env,
    preserve,
  };
}

test('archives with pinned standalone code and verifies GitHub upload metadata before writing receipts', async () => {
  const h = await harness();
  const sha = h.git('rev-parse', 'HEAD').trim();
  await rm(h.reviewDir, { recursive: true });
  const full = join(h.runner, 'gtfs-review');
  await mkdir(full);
  const report = {
    schemaVersion: 1,
    capture: { sha256: h.sha256, retrieved_at: '2026-11-25T20:00:00Z' },
    origin: 'https://sources.example.com',
    canonicalCommit: sha,
    runUrl: 'https://github.com/example/repo/actions/runs/123',
    inspectionOutcome: 'success',
    validation: { outcome: 'success' },
    current: {
      structuralErrors: [],
      coverage: { status: 'available', count: 365 },
    },
    comparison: { status: 'available' },
  };
  await writeFile(join(full, `${h.sha256}.json`), JSON.stringify(report));
  await writeFile(
    join(full, `${h.sha256}.md`),
    '# Snapshot\n\nOverview\n\n## Capture and comparison evidence\n\nExpanded evidence\n',
  );
  const mock = join(h.runner, 'mock-archive-fetch.mjs');
  await writeFile(
    mock,
    `import {createHash} from 'node:crypto';
const assets = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (!['api.github.com', 'uploads.github.com'].includes(url.hostname) || options.headers.Authorization !== 'Bearer test' || options.redirect !== 'error') throw new Error('Unsafe archive request');
  if (url.pathname.includes('/tags/')) return Response.json({id: 7, tag_name: 'gtfs-capture-reports-2026-11', draft: false});
  if (url.hostname === 'uploads.github.com') {
    if (options.method !== 'POST' || !Buffer.isBuffer(options.body)) throw new Error('Expected exact binary upload');
    const name = url.searchParams.get('name');
    assets.push({name, size: options.body.length, state: 'uploaded', digest: 'sha256:' + createHash('sha256').update(options.body).digest('hex'), browser_download_url: 'https://github.com/example/repo/releases/download/gtfs-capture-reports-2026-11/' + name});
    return Response.json({}, {status: 201});
  }
  return Response.json(assets);
};\n`,
  );
  await writeFile(
    join(h.repo, 'scripts/archive-gtfs-capture-review.mjs'),
    'throw new Error("Untrusted PR archiver executed");\n',
  );
  const yaml = await readFile('.github/workflows/gtfs-capture.yml', 'utf8');
  const script = yaml
    .split('      - name: Archive detailed capture reports\n')[1]
    .split('        run: |\n')[1]
    .split(/\n(?= {0,9}\S)/)[0]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd: h.repo,
    env: { ...h.env, GITHUB_SHA: sha, NODE_OPTIONS: `--import=${mock}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const receipt = JSON.parse(
    await readFile(join(h.reviewDir, `${h.sha256}.json`), 'utf8'),
  );
  expect(receipt.documentKind).toBe('gtfs-capture-review-receipt');
  expect(receipt.reports.json.url).toContain(
    '/releases/download/gtfs-capture-reports-2026-11/',
  );
  expect(
    await readFile(join(h.reviewDir, `${h.sha256}.md`), 'utf8'),
  ).not.toContain('Expanded evidence');
  expect(yaml).toMatch(/ARCHIVE_OUTCOME: \$\{\{ steps\.archive\.outcome \}\}/);
});

test('refreshes compact receipts on retry and preserves closed PRs', async () => {
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
  // A pushed branch with no PR is recovered with the current receipt.
  const refreshed = '# Different attempt\n';
  const firstCommit = h.git('rev-parse', 'HEAD').trim();
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), refreshed);
  h.run();
  const refreshedRecord = h.git('show', `HEAD:${h.record}`);
  expect(refreshedRecord).toContain(refreshed);
  expect(h.git('show', `${firstCommit}:${h.record}`)).toBe(markdown);
  await writeFile(
    join(h.runner, 'existing-pr'),
    'https://github.com/example/repo/pull/1\n',
  );
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# New review after closure\n',
  );
  h.run();
  expect(h.git('show', `origin/gtfs-review/${h.sha256}:${h.record}`)).toBe(
    refreshedRecord,
  );
});

test('the pinned helper remains available when the moving default branch removes it, and manual review continues', async () => {
  const h = await harness();
  const runSha = h.git('rev-parse', 'HEAD').trim();
  const expected = h.git(
    'show',
    `${runSha}:scripts/merge-gtfs-noop-review.mjs`,
  );
  h.git('rm', 'scripts/merge-gtfs-noop-review.mjs');
  h.git('commit', '-m', 'test: main removes helper');
  h.git('push', 'origin', 'main');
  h.preserve(runSha);
  expect(
    (
      await readFile(join(h.runner, 'merge-gtfs-noop-review.mjs'), 'utf8')
    ).trimEnd(),
  ).toBe(expected.trimEnd());
  h.env.PREPARATION_DECISION = 'hold';
  h.run();
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'Publication is held',
  );
});

test.each([
  false,
  true,
  'padding',
])('the final merge step runs pinned code and refuses invalid evidence (%s)', async (malformed) => {
  const h = await harness();
  const baseSha = h.git('rev-parse', 'main').trim();
  const runUrl = 'https://github.com/example/repo/actions/runs/123';
  const artifactUrl = `${runUrl}/artifacts/456`;
  const comparison = {
    schemaVersion: 2,
    documentKind: 'gtfs-capture-review-receipt',
    capture: { sha256: h.sha256, retrieved_at: '2026-11-25T20:00:00Z' },
    reports: Object.fromEntries(
      [
        ['json', 'json'],
        ['markdown', 'md'],
      ].map(([format, extension]) => [
        format,
        {
          sha256: '1'.repeat(64),
          byteLength: 100,
          url: `https://github.com/example/repo/releases/download/gtfs-capture-reports-2026-11/${'1'.repeat(64)}.${extension}`,
        },
      ]),
    ),
    canonicalCommit: baseSha,
    runUrl,
    artifactUrl,
    comparison: { status: 'available' },
    inspectionOutcome: 'success',
    validation: { outcome: 'success' },
    current: { structuralErrorCount: 0 },
  };
  await writeFile(
    join(h.reviewDir, `${h.sha256}.json`),
    JSON.stringify(comparison),
  );
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    `# Capture\n\n${baseSha}\n${runUrl}\n${artifactUrl}\n`,
  );
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  const index = {
    manifestSha256: 'd'.repeat(64),
    releaseSha256: 'e'.repeat(64),
  };
  const report = {
    decision: 'no-op',
    reasons: ['Only completed service changed.'],
    retainedManifestSha256: index.manifestSha256,
    historicalChanges: { serviceDates: ['2026-11-14'] },
    preparation: {
      captureSha256: h.sha256,
      captureRetrievedAt: '2026-11-25T20:00:00Z',
      baselineCaptureSha256: 'f'.repeat(64),
      baselineReleaseIndex: index,
      serviceDateRange: {
        startDate: '2026-11-09',
        endDateExclusive: '2026-12-01',
      },
      checkedAt: '2026-11-26T17:59:00Z',
      runUrl,
    },
  };
  await writeFile(
    join(automatic, 'automatic-publication.json'),
    JSON.stringify(report),
  );
  await writeFile(
    join(automatic, 'automatic-publication.md'),
    renderAutomaticPublicationReport(report),
  );
  await writeFile(join(automatic, 'preparation-base.txt'), 'absent\n');
  await writeFile(join(automatic, 'preparation-commit.txt'), `${baseSha}\n`);
  h.env.AUTOMATIC_REPORT = join(automatic, 'automatic-publication.md');
  h.env.PREPARATION_DECISION = 'no-op';
  Object.assign(h.env, {
    INDEPENDENT_OUTCOME: 'success',
    AUTOMATIC_RESULT: 'success',
    GITHUB_OUTPUT: join(h.runner, 'outputs'),
  });
  const copied = join(h.runner, 'merge-gtfs-noop-review.mjs');
  h.preserve(baseSha);
  h.run();
  const outputs = Object.fromEntries(
    (await readFile(h.env.GITHUB_OUTPUT, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  );
  expect(outputs['publication-noop']).toBe('true');
  let head = h.git('rev-parse', 'HEAD').trim();
  expect(outputs['head-sha']).toBe(head);
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'No-op preparation receipt',
  );
  if (malformed) {
    await writeFile(
      join(h.repo, `docs/gtfs/captures/${h.sha256}.json`),
      malformed === 'padding'
        ? JSON.stringify(comparison) + ' '.repeat(20000)
        : '{malformed',
    );
    h.git('add', `docs/gtfs/captures/${h.sha256}.json`);
    h.git('commit', '-m', 'test: malformed committed comparison');
    h.git('push', 'origin', `HEAD:${outputs.branch}`);
    head = h.git('rev-parse', 'HEAD').trim();
  }
  // This working-tree file must never be loaded by the final workflow step.
  await writeFile(
    join(h.repo, 'scripts/merge-gtfs-noop-review.mjs'),
    'throw new Error("Untrusted PR code executed");\n',
  );
  const mock = join(h.runner, 'mock-fetch.mjs');
  const mergeRequest = join(h.runner, 'merge-request.json');
  await writeFile(
    mock,
    `import { writeFileSync } from 'node:fs';
Date.now = () => Date.parse('2026-11-26T18:00:00Z');
globalThis.fetch = async (url, options = {}) => {
  let value;
  if (options.method === 'PUT') { writeFileSync(${JSON.stringify(mergeRequest)}, options.body); value = { merged: true, message: 'Merged' }; }
  else if (url.includes('data.mrtdown.org')) value = ${JSON.stringify(index)};
  else if (url.includes('/check-runs')) value = { total_count: 0, check_runs: [] };
  else if (url.includes('/status?')) value = { total_count: 0, statuses: [] };
  else if (url.includes('/reviews?')) value = [];
  else value = { state: 'open', draft: false, user: { login: 'github-actions[bot]' }, changed_files: 2,
    head: { sha: ${JSON.stringify(head)}, ref: ${JSON.stringify(outputs.branch)}, repo: { full_name: 'example/repo' } },
    base: { ref: 'main', sha: ${JSON.stringify('0'.repeat(40))}, repo: { full_name: 'example/repo' } } };
  return new Response(JSON.stringify(value), { status: 200 });
};\n`,
  );
  const result = execFileSync(process.execPath, ['--import', mock, copied], {
    cwd: h.repo,
    encoding: 'utf8',
    env: {
      ...h.env,
      REVIEW_PR_URL: outputs['pr-url'],
      REVIEW_HEAD_SHA: head,
      REVIEW_BRANCH: outputs.branch,
      GITHUB_SHA: baseSha,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_STEP_SUMMARY: join(h.runner, 'summary.md'),
    },
  });
  if (malformed) {
    const reason =
      malformed === 'padding'
        ? 'Committed capture evidence exceeds its byte budget.'
        : 'Committed comparison JSON is malformed.';
    expect(result).toContain(`GTFS no-op evidence left open: ${reason}`);
    expect(await readFile(join(h.runner, 'summary.md'), 'utf8')).toContain(
      reason,
    );
    await expect(readFile(mergeRequest)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } else {
    expect(result).toContain('GTFS no-op evidence merged');
    expect(JSON.parse(await readFile(mergeRequest, 'utf8'))).toMatchObject({
      sha: head,
      merge_method: 'squash',
    });
  }
  const workflow = await readFile('.github/workflows/gtfs-capture.yml', 'utf8');
  const mergeStep = workflow.split(
    '      - name: Merge verified no-op evidence\n',
  )[1];
  expect(mergeStep).toMatch(
    /^\s+run: node "\$RUNNER_TEMP\/merge-gtfs-noop-review\.mjs"\s*$/m,
  );
  expect(mergeStep).toMatch(
    /^\s+REVIEW_HEAD_SHA: \$\{\{ steps\.review\.outputs\.head-sha \}\}\s*$/m,
  );
  expect(mergeStep).toMatch(
    /^\s+REVIEW_PR_URL: \$\{\{ steps\.review\.outputs\.pr-url \}\}\s*$/m,
  );
  expect(mergeStep).toMatch(
    /^\s+REVIEW_BRANCH: \$\{\{ steps\.review\.outputs\.branch \}\}\s*$/m,
  );
  expect(workflow).toContain(
    "needs.inspect.outputs.independent-outcome == 'success'",
  );
  expect(workflow).toContain("steps.review.outputs.publication-noop == 'true'");
  expect(workflow.indexOf('Preserve trusted no-op merge code')).toBeLessThan(
    workflow.indexOf('Open snapshot review'),
  );
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

test.each([
  'md',
  'json',
])('rejects an oversized %s receipt before pushing a branch', async (extension) => {
  const h = await harness();
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), '# Snapshot\n');
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  await writeFile(
    join(h.reviewDir, `${h.sha256}.${extension}`),
    'x'.repeat(33000),
  );
  expect(h.run).toThrow();
  expect(
    h.git(
      'ls-remote',
      '--heads',
      'origin',
      `refs/heads/gtfs-review/${h.sha256}`,
    ),
  ).toBe('');
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

test.each([
  'ready',
  'no-op',
])('a failed archive ignores partial receipts and holds %s preparation', async (decision) => {
  const h = await harness();
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Partial archive output\n',
  );
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  await mkdir(join(h.runner, 'gtfs-automatic'));
  await writeFile(
    join(h.runner, 'gtfs-automatic/preparation-base.txt'),
    'absent\n',
  );
  await writeFile(
    join(h.runner, 'gtfs-automatic/release-definition.json'),
    JSON.stringify({
      documentKind: 'gtfs-release-definition',
      capture: { sha256: h.sha256 },
    }),
  );
  h.env.PREPARATION_DECISION = decision;
  h.env.ARCHIVE_OUTCOME = 'failure';
  h.run();
  const record = h.git('show', `HEAD:${h.record}`);
  expect(record).toContain('durable archival failed');
  expect(record).toContain('Publication is held');
  expect(record).not.toContain('Partial archive output');
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    `${h.sha256}.json`,
  );
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    'releases/gtfs.json',
  );
});

test('ready reviews commit the desired definition, refresh it and restore main on holds', async () => {
  const h = await harness();
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Snapshot\n\nSource changes\n',
  );
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  const definition = {
    schemaVersion: 1,
    documentKind: 'gtfs-release-definition',
    capture: { sha256: h.sha256 },
    releaseIndex: { manifestSha256: 'b'.repeat(64) },
  };
  const candidatePath = join(automatic, 'release-definition.json');
  await writeFile(candidatePath, JSON.stringify(definition));
  await writeFile(join(automatic, 'preparation-base.txt'), 'absent\n');
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  const path = 'releases/gtfs.json';
  expect(JSON.parse(h.git('show', `HEAD:${path}`))).toEqual(definition);
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'standard Pages workflow',
  );
  definition.releaseIndex.manifestSha256 = 'c'.repeat(64);
  await writeFile(candidatePath, JSON.stringify(definition));
  h.run();
  expect(JSON.parse(h.git('show', `HEAD:${path}`))).toEqual(definition);
  // A failed/held refresh cannot merge an older candidate.
  h.env.PREPARATION_DECISION = 'hold';
  await rm(candidatePath);
  h.run();
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(path);
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'Publication is held',
  );
  // After adoption a hold restores main's desired timetable instead of removing it.
  const branch = h.git('rev-parse', 'HEAD').trim();
  h.git('checkout', 'main');
  await mkdir(join(h.repo, 'releases'), { recursive: true });
  await writeFile(join(h.repo, path), '{"completed":"main"}\n');
  h.git('add', path);
  h.git('commit', '-m', 'test: adopt a definition');
  h.git('push', 'origin', 'main');
  h.git('checkout', '--detach', branch);
  await writeFile(candidatePath, JSON.stringify(definition));
  await writeFile(
    join(automatic, 'preparation-base.txt'),
    h.git('rev-parse', 'main:releases/gtfs.json'),
  );
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  h.env.PREPARATION_DECISION = 'hold';
  await rm(candidatePath);
  h.run();
  expect(JSON.parse(h.git('show', `HEAD:${path}`))).toEqual({
    completed: 'main',
  });
});

test('missing comparisons never change the desired release even when preparation produced a definition', async () => {
  const h = await harness();
  await mkdir(join(h.runner, 'gtfs-automatic'));
  await writeFile(
    join(h.runner, 'gtfs-automatic/preparation-base.txt'),
    'absent\n',
  );
  await writeFile(
    join(h.runner, 'gtfs-automatic/release-definition.json'),
    JSON.stringify({
      documentKind: 'gtfs-release-definition',
      capture: { sha256: h.sha256 },
    }),
  );
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(
    'releases/gtfs.json',
  );
});

test('a ready retry upgrades receipt-only evidence before committing the desired release', async () => {
  const h = await harness();
  h.run();
  expect(h.git('show', `HEAD:${h.record}`)).toContain(
    'Comparison and findings summary unavailable',
  );
  const markdown = '# Snapshot\n\nRecovered source comparison\n';
  const evidence = '{"comparison":"recovered"}\n';
  await writeFile(join(h.reviewDir, `${h.sha256}.md`), markdown);
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), evidence);
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  const definition = {
    documentKind: 'gtfs-release-definition',
    capture: { sha256: h.sha256 },
  };
  await writeFile(
    join(automatic, 'release-definition.json'),
    JSON.stringify(definition),
  );
  await writeFile(join(automatic, 'preparation-base.txt'), 'absent\n');
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  const report = h.git('show', `HEAD:${h.record}`);
  expect(report).toContain('Recovered source comparison');
  expect(report).not.toContain('Comparison and findings summary unavailable');
  expect(report).not.toContain('Merging this record retains evidence only');
  expect(h.git('show', `HEAD:docs/gtfs/captures/${h.sha256}.json`)).toBe(
    evidence,
  );
  expect(JSON.parse(h.git('show', 'HEAD:releases/gtfs.json'))).toEqual(
    definition,
  );
  const recoveredCommit = h.git('rev-parse', 'HEAD').trim();
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Another comparison\n',
  );
  await writeFile(
    join(h.reviewDir, `${h.sha256}.json`),
    '{"comparison":"different"}\n',
  );
  h.run();
  expect(h.git('show', `HEAD:${h.record}`)).toContain('Another comparison');
  expect(
    h.git('show', `${recoveredCommit}:docs/gtfs/captures/${h.sha256}.json`),
  ).toBe(evidence);
});

test.each([
  false,
  true,
])('holds a ready candidate if main changed since preparation (already adopted: %s)', async (adopted) => {
  const h = await harness();
  const path = 'releases/gtfs.json';
  await mkdir(join(h.repo, 'releases'));
  if (adopted) {
    await writeFile(join(h.repo, path), '{"release":"original"}\n');
    h.git('add', path);
    h.git('commit', '-m', 'test: original definition');
    h.git('push', 'origin', 'main');
  }
  const preparedBase = adopted
    ? h.git('rev-parse', `HEAD:${path}`)
    : 'absent\n';
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Snapshot\n\nSource changes\n',
  );
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  await writeFile(join(automatic, 'preparation-base.txt'), preparedBase);
  await writeFile(
    join(automatic, 'release-definition.json'),
    JSON.stringify({
      documentKind: 'gtfs-release-definition',
      capture: { sha256: h.sha256 },
      release: 'stale candidate',
    }),
  );
  // A different release lands between the preparation checkout and the review checkout.
  await writeFile(join(h.repo, path), '{"release":"newer main"}\n');
  h.git('add', path);
  h.git('commit', '-m', 'test: main advances');
  h.git('push', 'origin', 'main');
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  expect(JSON.parse(h.git('show', `HEAD:${path}`))).toEqual({
    release: 'newer main',
  });
  const body = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(body).toContain('Publication is held');
  expect(body).toContain('changed since preparation');
  expect(body).not.toContain('Merging makes this the desired timetable');
});

test.each([
  false,
  true,
])('no-op preparation preserves main and removes a stale proposed release (adopted: %s)', async (adopted) => {
  const h = await harness();
  const path = 'releases/gtfs.json';
  if (adopted) {
    await mkdir(join(h.repo, 'releases'));
    await writeFile(join(h.repo, path), '{"release":"completed"}\n');
    h.git('add', path);
    h.git('commit', '-m', 'test: completed desired release');
    h.git('push', 'origin', 'main');
  }
  await writeFile(
    join(h.reviewDir, `${h.sha256}.md`),
    '# Snapshot\n\nSource comparison\n',
  );
  await writeFile(join(h.reviewDir, `${h.sha256}.json`), '{}\n');
  const automatic = join(h.runner, 'gtfs-automatic');
  await mkdir(automatic);
  await writeFile(
    join(automatic, 'preparation-base.txt'),
    adopted ? h.git('rev-parse', `main:${path}`) : 'absent\n',
  );
  const candidate = join(automatic, 'release-definition.json');
  await writeFile(
    candidate,
    JSON.stringify({
      documentKind: 'gtfs-release-definition',
      capture: { sha256: h.sha256 },
      release: 'old proposal',
    }),
  );
  h.env.PREPARATION_DECISION = 'ready';
  h.run();
  h.env.PREPARATION_DECISION = 'no-op';
  await rm(candidate);
  const noopReport = adopted
    ? '## Automatic publication\n\nDecision: **no-op**. All remaining approved service is unchanged.\n\n<details>\n<summary>Retained timetable proof</summary>\n\n```json\n{"expiredServiceDates":["2026-11-14"],"outsideApprovedServiceDates":["2026-12-02"]}\n```\n\n</details>\n'
    : '## Automatic publication\n\nDecision: **no-op**. Only expired service dates changed.\n';
  await writeFile(h.env.AUTOMATIC_REPORT, noopReport);
  h.run();
  if (adopted)
    expect(JSON.parse(h.git('show', `HEAD:${path}`))).toEqual({
      release: 'completed',
    });
  else
    expect(h.git('ls-tree', '-r', '--name-only', 'HEAD')).not.toContain(path);
  const body = await readFile(join(h.runner, 'created-body.md'), 'utf8');
  expect(body).toContain('No publication needed');
  expect(body).toContain(noopReport);
  expect(h.git('show', `HEAD:docs/gtfs/captures/${h.sha256}.md`)).toContain(
    noopReport,
  );
  expect(body).not.toContain('Publication is held');
  // A no-op proof based on another desired definition must not be accepted.
  await writeFile(join(automatic, 'preparation-base.txt'), 'different-base\n');
  h.run();
  expect(await readFile(join(h.runner, 'created-body.md'), 'utf8')).toContain(
    'Publication is held',
  );
});
