import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  combinedPagesFixture,
  combinedReleaseInstant,
  combinedTermsText,
} from '../packages/cli/src/commands/__tests__/combinedPagesFixture.js';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import { prepareCombinedTimetableExport } from './export-pages-combined-timetable.mjs';
import {
  assertBootstrapAllowed,
  checkReleaseTransition,
  createReleaseDefinition,
  materializeReleaseDefinition,
  readReleaseDefinition,
  validateReleaseDefinition,
} from './gtfs-release-definition.mjs';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-definition-'));
  roots.push(root);
  const { options, config } = await combinedPagesFixture(
    root,
    resolve('fixtures/generated/data'),
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(combinedReleaseInstant));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(combinedTermsText)),
  );
  const staged = join(root, 'staged');
  await cp(options.dataDir, staged, { recursive: true });
  await rm(join(staged, 'combined-timetable'), { recursive: true });
  const exporter = await prepareCombinedTimetableExport(options);
  const { index } = await exporter(staged);
  await writeFile(join(root, 'release-index.json'), JSON.stringify(index));
  await cp(
    join(staged, 'combined-timetable/release.json'),
    join(root, 'release-evidence.json'),
  );
  const draft = await json(join(root, config.draft));
  const compact = {
    ...config,
    draft: undefined,
    draftSha256: draft.draftSha256,
    approvedRelease: {
      index: 'release-index.json',
      evidence: 'release-evidence.json',
    },
  };
  await writeFile(join(root, 'combined-pages.json'), JSON.stringify(compact));
  const capture = await json(options.gtfsCapture);
  await writeFile(
    join(root, 'source-review.json'),
    JSON.stringify({
      schemaVersion: 1,
      documentKind: 'scheduled-timetable-source-review',
      decision: 'successor',
      predecessor: {
        manifestSha256: 'a'.repeat(64),
        snapshotSha256: 'b'.repeat(64),
      },
      successor: {
        manifestSha256: index.manifestSha256,
        snapshotSha256: capture.sha256,
      },
      reviewer: 'Fixture reviewer',
      reviewedAt: combinedReleaseInstant,
      reason: 'Reviewed synthetic release',
    }),
  );
  const definition = await createReleaseDefinition(root);
  const acquire = vi.fn(async (origin: string, key: string, output: string) => {
    expect(origin).toBe('https://captures.example.com');
    expect(key).toBe(`captures/schedule/${capture.sha256}.json`);
    await mkdir(output);
    await cp(options.gtfsFile, join(output, 'schedule.zip'));
    return { file: join(output, 'schedule.zip') };
  });
  return { root, options, definition, acquire, index };
}

test('a committed definition recreates exact approved inputs and builds the same timetable without an Actions artifact', async () => {
  const h = await fixture();
  const file = join(h.root, 'desired.json');
  await writeFile(file, JSON.stringify(h.definition, null, 2));
  const desired = await readReleaseDefinition(file);
  const input = join(h.root, 'inputs');
  await materializeReleaseDefinition(
    desired,
    input,
    'https://captures.example.com',
    h.acquire,
  );
  expect(await readFile(join(input, 'release-evidence.json'))).toEqual(
    await readFile(join(h.root, 'release-evidence.json')),
  );
  const exporter = await prepareCombinedTimetableExport({
    ...h.options,
    gtfsFile: join(input, 'schedule.zip'),
    gtfsCapture: join(input, 'capture.json'),
    gtfsCombinedConfig: join(input, 'combined-pages.json'),
    outDir: join(h.root, 'new-pages'),
  });
  await rm(join(h.root, 'staged/combined-timetable'), { recursive: true });
  expect((await exporter(join(h.root, 'staged'))).index).toEqual(h.index);
  expect(h.acquire).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(desired)).not.toContain('artifactId');
});

test('corrupt or missing external source fails cleanly and never substitutes another release', async () => {
  const h = await fixture();
  const input = join(h.root, 'inputs');
  await expect(
    materializeReleaseDefinition(
      h.definition,
      input,
      'https://captures.example.com',
      async (_origin, _key, output) => {
        await mkdir(output);
        const file = join(output, 'schedule.zip');
        await writeFile(file, 'wrong bytes');
        return { file };
      },
    ),
  ).rejects.toThrow('reviewed hash or size');
  expect(
    await readFile(join(input, 'capture.json')).catch(() => null),
  ).toBeNull();
  await expect(
    materializeReleaseDefinition(
      h.definition,
      input,
      'https://captures.example.com',
      async () => {
        throw new Error('source unavailable');
      },
    ),
  ).rejects.toThrow('source unavailable');
});

test('definition validation binds source, approval evidence and expected release identities', async () => {
  const { definition } = await fixture();
  const changed = structuredClone(definition);
  changed.releaseEvidence.currentTerms.licence.sha256 = 'f'.repeat(64);
  expect(() => validateReleaseDefinition(changed)).toThrow(
    'identities or evidence',
  );
  expect(() =>
    validateReleaseDefinition({
      ...definition,
      capture: { ...definition.capture, sha256: 'f'.repeat(64) },
    }),
  ).toThrow('identities or evidence');
  expect(() =>
    validateReleaseDefinition({
      ...definition,
      policies: { ...definition.policies, '../outside': {} },
    }),
  ).toThrow();
  expect(() =>
    validateReleaseDefinition({ ...definition, draftSha256: 'f'.repeat(64) }),
  ).toThrow('identities or evidence');
});

test('the definition chooses the desired successor; completed state only checks lineage and permits ordinary redeploys', async () => {
  const h = await fixture();
  const previous = {
    manifestSha256: 'a'.repeat(64),
    releaseSha256: 'b'.repeat(64),
  };
  expect(checkReleaseTransition(h.definition, previous)).toBe('successor');
  expect(() =>
    checkReleaseTransition(h.definition, {
      ...previous,
      manifestSha256: 'f'.repeat(64),
    }),
  ).toThrow('completed predecessor');
  expect(
    checkReleaseTransition(h.definition, h.index, {
      now: '2027-01-01T00:00:00Z',
    }),
  ).toBe('redeploy');
  const policyBytes = Buffer.from(
    JSON.stringify({ maximumCaptureAgeHours: 72 }),
  );
  const automatic = {
    ...h.definition,
    preparationPolicySha256: hashBytes(policyBytes),
  };
  expect(
    checkReleaseTransition(automatic, previous, {
      policyBytes,
      now: '2026-11-03T20:00:00Z',
    }),
  ).toBe('successor');
  expect(() =>
    checkReleaseTransition(automatic, previous, { policyBytes }),
  ).toThrow('stale');
  expect(() =>
    checkReleaseTransition(automatic, previous, {
      policyBytes: Buffer.from('{}'),
    }),
  ).toThrow('policy changed');
  expect(() =>
    checkReleaseTransition(h.definition, previous, {
      now: '2026-11-30T16:00:00Z',
    }),
  ).toThrow('window is not active');
});

test('missing definition is allowed only before adoption; invalid JSON and deletion cannot select retained state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gtfs-definition-bootstrap-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  await writeFile(join(root, 'README.md'), 'Seed');
  git('add', '.');
  git('commit', '-m', 'test: seed');
  expect(() => assertBootstrapAllowed(root)).not.toThrow();
  expect(await readReleaseDefinition(join(root, 'missing.json'))).toBeNull();
  await mkdir(join(root, 'releases'));
  await writeFile(join(root, 'releases/gtfs.json'), '{}');
  git('add', '.');
  git('commit', '-m', 'test: adopted');
  await rm(join(root, 'releases/gtfs.json'));
  git('add', '.');
  git('commit', '-m', 'test: deleted');
  expect(() => assertBootstrapAllowed(root)).toThrow('was removed');
  await writeFile(join(root, 'bad.json'), '{');
  await expect(readReleaseDefinition(join(root, 'bad.json'))).rejects.toThrow();
});

test('definition generation rejects policy symlinks inside the prepared directory', async () => {
  const h = await fixture();
  const config = await json(join(h.root, 'combined-pages.json'));
  const outside = join(h.root, 'outside');
  await mkdir(outside);
  const real = join(h.root, config.applicabilityPolicy);
  const bytes = await readFile(real);
  await rm(real);
  await writeFile(join(outside, 'policy.json'), bytes);
  await symlink(join(outside, 'policy.json'), real);
  await expect(createReleaseDefinition(h.root)).rejects.toThrow(
    'regular files',
  );
});

test('definition generation rejects a regular policy file outside the prepared directory', async () => {
  const h = await fixture();
  const configPath = join(h.root, 'combined-pages.json');
  const config = await json(configPath);
  const outside = await mkdtemp(join(tmpdir(), 'gtfs-external-policy-'));
  roots.push(outside);
  const externalPolicy = join(outside, 'policy.json');
  await cp(join(h.root, config.applicabilityPolicy), externalPolicy);
  config.applicabilityPolicy = externalPolicy;
  await writeFile(configPath, JSON.stringify(config));
  await expect(createReleaseDefinition(h.root)).rejects.toThrow(
    'regular files inside the input directory',
  );
});
