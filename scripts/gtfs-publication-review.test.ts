import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  mergedCapture,
  preparedContentSha256,
  validatePreparationRun,
  validateRequest,
  verifyPreparedRelease,
} from './gtfs-publication-review.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
const repo = 'foldaway/mrtdown-data';
const sha256 = 'a'.repeat(64);
const manifestSha256 = 'b'.repeat(64);
const predecessorManifestSha256 = 'c'.repeat(64);
const now = new Date('2026-11-23T20:00:00Z');
const terms = { licence: { sha256: 'licence' }, apiTerms: { sha256: 'terms' } };
const writeJson = (directory: string, name: string, value: unknown) =>
  writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);

async function prepared() {
  const directory = await mkdtemp(join(tmpdir(), 'gtfs-prepared-'));
  const baseline = await mkdtemp(join(tmpdir(), 'gtfs-baseline-'));
  directories.push(directory, baseline);
  await Promise.all([
    writeJson(directory, 'capture.json', {
      sha256,
      retrieved_at: now.toISOString(),
    }),
    writeJson(directory, 'release-index.json', {
      manifestSha256,
      releaseSha256: 'd'.repeat(64),
    }),
    writeJson(directory, 'source-review.json', {
      predecessor: { manifestSha256: predecessorManifestSha256 },
      successor: { manifestSha256, snapshotSha256: sha256 },
    }),
    writeJson(directory, 'release-evidence.json', { currentTerms: terms }),
    writeJson(directory, 'applicabilityPolicy.json', {
      serviceDateRange: {
        startDate: '2026-11-09',
        endDateExclusive: '2026-12-01',
      },
    }),
    writeJson(baseline, 'release-index.json', {
      manifestSha256: predecessorManifestSha256,
    }),
  ]);
  const request = {
    schemaVersion: 1,
    captureSha256: sha256,
    manifestSha256,
    predecessorManifestSha256,
    contentSha256: await preparedContentSha256(directory),
    policySha256: createHash('sha256')
      .update(
        await readFile(
          'docs/gtfs/operations/automatic-publication-policy.json',
        ),
      )
      .digest('hex'),
    runId: '123',
    artifactId: '456',
  };
  const verify = () =>
    verifyPreparedRelease(directory, baseline, request, {
      now,
      terms: async () => terms,
    });
  return { directory, baseline, request, verify };
}

test('only a merged same-repository capture review targeting main can publish', () => {
  const event = {
    action: 'closed',
    pull_request: {
      merged: true,
      merge_commit_sha: 'd'.repeat(40),
      head: { ref: `gtfs-review/${sha256}`, repo: { full_name: repo } },
      base: { ref: 'main', repo: { full_name: repo } },
    },
  };
  expect(mergedCapture(event, repo)).toBe(sha256);
  expect(
    mergedCapture(
      { ...event, pull_request: { ...event.pull_request, merged: false } },
      repo,
    ),
  ).toBeNull();
  expect(
    mergedCapture(
      {
        ...event,
        pull_request: { ...event.pull_request, head: { ref: 'fix/something' } },
      },
      repo,
    ),
  ).toBeNull();
  for (const pr of [
    {
      ...event.pull_request,
      head: { ...event.pull_request.head, repo: { full_name: 'someone/fork' } },
    },
    {
      ...event.pull_request,
      base: { ...event.pull_request.base, ref: 'other' },
    },
    {
      ...event.pull_request,
      head: { ...event.pull_request.head, ref: 'gtfs-review/invalid' },
    },
  ])
    expect(() => mergedCapture({ ...event, pull_request: pr }, repo)).toThrow();
});

test('requires the successful trusted preparation run and the exact unexpired artifact', async () => {
  const { request } = await prepared();
  expect(validateRequest(request, sha256)).toBe(request);
  expect(() => validateRequest(request, 'e'.repeat(64))).toThrow();
  expect(() =>
    validateRequest({ ...request, artifactId: '../oops' }, sha256),
  ).toThrow();
  const run = {
    id: 123,
    path: '.github/workflows/gtfs-capture.yml',
    event: 'repository_dispatch',
    head_branch: 'main',
    head_repository: { full_name: repo },
    conclusion: 'success',
    run_attempt: 1,
  };
  const artifact = {
    id: 456,
    name: 'gtfs-prepared-123-1',
    expired: false,
    workflow_run: { id: 123 },
  };
  expect(() =>
    validatePreparationRun(request, run, artifact, repo),
  ).not.toThrow();
  for (const changed of [
    { ...run, conclusion: 'failure' },
    { ...run, event: 'pull_request' },
    { ...run, path: '.github/workflows/other.yml' },
    { ...run, head_repository: { full_name: 'someone/fork' } },
  ])
    expect(() =>
      validatePreparationRun(request, changed, artifact, repo),
    ).toThrow();
  for (const changed of [
    { ...artifact, id: 999 },
    { ...artifact, workflow_run: { id: 999 } },
    { ...artifact, expired: true },
    { ...artifact, name: 'gtfs-prepared-123-2' },
  ])
    expect(() => validatePreparationRun(request, run, changed, repo)).toThrow();
});

test('deploys the reviewed content only against its predecessor; an exact completed retry is a no-op', async () => {
  const h = await prepared();
  expect(await h.verify()).toBe('ready');
  await writeJson(h.baseline, 'release-index.json', {
    manifestSha256: 'e'.repeat(64),
  });
  await expect(h.verify()).rejects.toThrow('baseline changed');
  await writeFile(
    join(h.baseline, 'release-index.json'),
    await readFile(join(h.directory, 'release-index.json')),
  );
  expect(await h.verify()).toBe('unchanged');
});

test('rejects altered files, changed policy and source identities', async () => {
  const h = await prepared();
  await writeFile(join(h.directory, 'extra.json'), '{}');
  await expect(h.verify()).rejects.toThrow('reviewed content');
  await rm(join(h.directory, 'extra.json'));
  h.request.policySha256 = 'e'.repeat(64);
  await expect(h.verify()).rejects.toThrow('publication policy');
  const other = await prepared();
  other.request.manifestSha256 = 'e'.repeat(64);
  await expect(other.verify()).rejects.toThrow('identities');
  await symlink(
    join(other.directory, 'capture.json'),
    join(other.directory, 'alias.json'),
  );
  await expect(preparedContentSha256(other.directory)).rejects.toThrow(
    'regular files',
  );
});

test('rechecks capture age, current terms and Singapore service dates at merge time', async () => {
  const h = await prepared();
  const verifyAt = (time: string) =>
    verifyPreparedRelease(h.directory, h.baseline, h.request, {
      now: new Date(time),
      terms: async () => terms,
    });
  await expect(verifyAt('2026-11-27T20:00:00Z')).rejects.toThrow('stale');
  await expect(verifyAt('2026-11-23T19:00:00Z')).rejects.toThrow('stale');
  await expect(
    verifyPreparedRelease(h.directory, h.baseline, h.request, {
      now,
      terms: async () => ({ ...terms, apiTerms: { sha256: 'changed' } }),
    }),
  ).rejects.toThrow('terms changed');
  await writeJson(h.directory, 'capture.json', {
    sha256,
    retrieved_at: '2026-11-30T15:00:00Z',
  });
  h.request.contentSha256 = await preparedContentSha256(h.directory);
  // Singapore reaches December while UTC is still November.
  await expect(verifyAt('2026-11-30T16:00:00Z')).rejects.toThrow(
    'window has expired',
  );
});
