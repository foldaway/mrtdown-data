import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pages-site-pull-'));
  directories.push(root);
  const pages = join(root, 'pages-dist');
  const approved = join(root, 'combined-release/release-index.json');
  const sourceReview = join(root, 'source-review.json');
  const payload = join(pages, 'combined-timetable-publication.json');
  const bin = join(root, 'bin');
  await Promise.all([
    mkdir(join(pages, 'combined-timetable'), { recursive: true }),
    mkdir(join(root, 'combined-release')),
    mkdir(bin),
  ]);
  const capture = {
    sha256: 'a'.repeat(64),
    retrieved_at: '2026-11-01T00:00:00Z',
  };
  const manifest = Buffer.from(JSON.stringify({ capture }));
  const release = Buffer.from('{"approval":"reviewed"}');
  const index = {
    manifestSha256: hashBytes(manifest),
    releaseSha256: hashBytes(release),
  };
  await writeFile(join(pages, 'combined-timetable/manifest.json'), manifest);
  await writeFile(join(pages, 'combined-timetable/release.json'), release);
  // Legacy/retained inputs preserve compact JSON and may use another key order.
  await writeFile(
    approved,
    JSON.stringify({
      releaseSha256: index.releaseSha256,
      manifestSha256: index.manifestSha256,
    }),
  );
  await writeFile(
    join(pages, 'combined-timetable-release-index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  await writeFile(
    sourceReview,
    JSON.stringify({
      schemaVersion: 1,
      documentKind: 'scheduled-timetable-source-review',
      decision: 'baseline',
      predecessor: null,
      successor: {
        manifestSha256: index.manifestSha256,
        snapshotSha256: capture.sha256,
      },
      reviewer: 'Test reviewer',
      reviewedAt: '2026-11-02T00:00:00Z',
      reason: 'Approved test release',
    }),
  );
  // Packaging itself is covered by the exporter suites. Exercise the actual
  // workflow step with those outputs already built to catch extra post-build gates.
  await writeFile(join(bin, 'npm'), '#!/bin/bash\nexit 0\n');
  await chmod(join(bin, 'npm'), 0o755);
  const workflow = await readFile(
    resolve('.github/workflows/pages-deploy.yml'),
    'utf8',
  );
  const build = workflow
    .split('      - name: Build Pages artifact\n')[1]
    .split('        run: |\n')[1]
    .split(/\n(?= {0,9}\S)/)[0]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const runBuild = () =>
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', build], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
        COMBINED_TIMETABLE_ENABLED: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const runPull = () =>
    execFileSync(
      process.execPath,
      [
        resolve('scripts/prepare-pages-site-pull.mjs'),
        pages,
        approved,
        payload,
        sourceReview,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  return { root, pages, approved, payload, index, runBuild, runPull };
}

test('bootstrap packaging and site handoff accept equivalent compact and pretty release indexes', async () => {
  const h = await fixture();
  expect(() => h.runBuild()).not.toThrow();
  h.runPull();
  expect(
    JSON.parse(await readFile(h.payload, 'utf8')).combinedReleaseIndex,
  ).toEqual(h.index);
  expect(
    JSON.parse(await readFile(h.payload, 'utf8')).sourceReview.successor,
  ).toEqual({
    manifestSha256: h.index.manifestSha256,
    snapshotSha256: 'a'.repeat(64),
  });
});

test.each([
  'manifestSha256',
  'releaseSha256',
])('site handoff rejects a different approved %s', async (field) => {
  const h = await fixture();
  await writeFile(
    h.approved,
    JSON.stringify({ ...h.index, [field]: 'f'.repeat(64) }),
  );
  expect(h.runPull).toThrow(
    'Pages release does not match the approved release index',
  );
  expect(await readFile(h.payload).catch(() => null)).toBeNull();
});

test.each([
  'manifest.json',
  'release.json',
])('site handoff still rejects altered %s bytes with unchanged index identities', async (name) => {
  const h = await fixture();
  await writeFile(join(h.pages, 'combined-timetable', name), '{}');
  expect(h.runPull).toThrow(
    'Pages release does not match the approved release index',
  );
  expect(await readFile(h.payload).catch(() => null)).toBeNull();
});
