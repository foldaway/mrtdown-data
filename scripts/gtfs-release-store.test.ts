import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import {
  deterministicZip,
  objectDescriptor,
  releaseId,
} from './gtfs-release-recipe.mjs';
import {
  alreadyRetainedRelease,
  currentRetainedRelease,
  readPreparedRetainedRelease,
  resumeCurrentRetainedRelease,
  retainPreparedRelease,
} from './gtfs-release-store.mjs';
import { retainPublishedRelease } from './retain-gtfs-release.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function memoryStore() {
  const objects = new Map<string, { bytes: Buffer; etag: string }>();
  const deleted: string[] = [];
  const writes: string[] = [];
  return {
    objects,
    deleted,
    writes,
    async read(key: string) {
      return objects.get(key) ?? null;
    },
    async write(key: string, bytes: Buffer, expected: string | null) {
      if ((objects.get(key)?.etag ?? null) !== expected)
        throw new Error('Conditional write failed');
      const etag = hashBytes(bytes);
      writes.push(key);
      objects.set(key, { bytes, etag });
      return etag;
    },
    async remove(key: string, etag: string) {
      if (objects.get(key)?.etag !== etag)
        throw new Error('Conditional delete failed');
      objects.delete(key);
      deleted.push(key);
    },
  };
}
function prepared(name: string) {
  const index = {
    manifestSha256: hashBytes(Buffer.from(`${name}-manifest`)),
    releaseSha256: hashBytes(Buffer.from(`${name}-release`)),
  };
  const id = releaseId(index);
  const objects = new Map<string, Buffer>();
  const inputs = ['sources', 'canonical', 'generators'].map((kind) => {
    const bytes = Buffer.from(kind);
    const ref = objectDescriptor(
      kind,
      bytes,
      kind === 'sources' ? 'zip' : 'tar.gz',
    );
    objects.set(ref.key, bytes);
    return ref;
  });
  const bytes = Buffer.from(name);
  const recipe = objectDescriptor('recipes', bytes, 'zip');
  objects.set(recipe.key, bytes);
  const outputs = {
    'timetable.json': { sha256: hashBytes(bytes), byteLength: bytes.length },
  };
  const bundle = {
    ...objectDescriptor(
      'bundles',
      deterministicZip({ 'timetable.json': bytes }),
      'zip',
    ),
    key: `bundles/${id}.zip`,
  };
  const record = {
    schemaVersion: 1,
    documentKind: 'gtfs-retained-release',
    releaseId: id,
    releaseIndex: index,
    recipe,
    inputs,
    outputs,
    bundle,
    replay: { releaseId: id, recipeSha256: recipe.sha256 },
  };
  return {
    record,
    objects,
    bundleBytes: deterministicZip({ 'timetable.json': bytes }),
  };
}
const replay = async (bytes: Buffer) => ({
  bundleFiles: { 'timetable.json': bytes },
  replay: { releaseId: prepared(bytes.toString()).record.releaseId },
  outputs: {
    'timetable.json': { sha256: hashBytes(bytes), byteLength: bytes.length },
  },
});

test('restores a missing legacy ready ZIP without changing its immutable record', async () => {
  const store = memoryStore();
  const a = prepared('a');
  a.bundleBytes = Buffer.from(
    zipSync(
      { 'timetable.json': Buffer.from('a') },
      { level: 9, mtime: new Date(1999, 11, 31, 16) },
    ),
  );
  a.record.bundle = {
    ...objectDescriptor('bundles', a.bundleBytes, 'zip'),
    key: a.record.bundle.key,
  };
  await retainPreparedRelease(store, a, null, { replay });
  store.objects.delete(a.record.bundle.key);
  const restored = await readPreparedRetainedRelease(
    store,
    a.record.releaseId,
    { replay },
  );
  expect(restored.bundleBytes).toEqual(a.bundleBytes);
  expect(restored.record).toEqual(a.record);
});

test('preserves a ready ZIP whose exact container cannot be rebuilt despite raw output parity', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  a.bundleBytes = Buffer.from(
    zipSync(
      { 'timetable.json': Buffer.from('a') },
      { level: 9, mtime: new Date(2026, 0, 1) },
    ),
  );
  a.record.bundle = {
    ...objectDescriptor('bundles', a.bundleBytes, 'zip'),
    key: a.record.bundle.key,
  };
  await retainPreparedRelease(store, a, null, { replay });
  await retainPreparedRelease(store, b, a.record.releaseId, { replay });
  await expect(
    retainPreparedRelease(store, c, b.record.releaseId, { replay }),
  ).rejects.toThrow(/cannot be reproduced/);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.deleted).not.toContain(a.record.bundle.key);
});

test('requires a complete current release for automatic publication', async () => {
  const store = memoryStore();
  await expect(currentRetainedRelease(store)).rejects.toThrow(/Missing/);
  const current = prepared('current');
  await retainPreparedRelease(store, current, null, { replay });
  expect((await currentRetainedRelease(store)).record.releaseIndex).toEqual(
    current.record.releaseIndex,
  );
  const staged = await store.read('staged.json');
  await store.write(
    'staged.json',
    Buffer.from(
      JSON.stringify({ schemaVersion: 1, candidates: ['f'.repeat(64)] }),
    ),
    staged?.etag ?? null,
  );
  await expect(currentRetainedRelease(store)).rejects.toThrow(
    /cleanup is pending/,
  );
  const pending = await store.read('staged.json');
  await store.write(
    'staged.json',
    Buffer.from(JSON.stringify({ schemaVersion: 1, candidates: [] })),
    pending?.etag ?? null,
  );
  store.objects.delete(current.record.bundle.key);
  await expect(currentRetainedRelease(store)).rejects.toThrow(/incomplete/);
});

test('rotates current/previous, deduplicates shared inputs, and prunes only replayable older ready bundles', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  await retainPreparedRelease(store, b, a.record.releaseId, { replay });
  const result = await retainPreparedRelease(store, c, b.record.releaseId, {
    replay,
  });
  expect(result).toMatchObject({
    current: c.record.releaseId,
    previous: b.record.releaseId,
    pruned: [a.record.releaseId],
  });
  expect(store.objects.has(a.record.bundle.key)).toBe(false);
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
  for (const item of [a.record.recipe, ...a.record.inputs])
    expect(store.objects.has(item.key)).toBe(true);
  expect(
    [...store.objects.keys()].filter((key) => key.startsWith('sources/')),
  ).toHaveLength(1);
  expect((await retainPreparedRelease(store, c, null, { replay })).action).toBe(
    'already-current',
  );
  expect(
    JSON.parse(store.objects.get('index.json')?.bytes.toString()).previous,
  ).toBe(b.record.releaseId);
  const objectCount = store.objects.size;
  const cached = await alreadyRetainedRelease(store, c.record.releaseIndex);
  expect(cached?.record.recipe).toEqual(c.record.recipe);
  expect(store.objects.size).toBe(objectCount);
});

test('failed candidate replay preserves the incumbent and never prunes', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b');
  await retainPreparedRelease(store, a, null, { replay });
  const before = store.objects.get('index.json')?.bytes;
  await expect(
    retainPreparedRelease(store, b, a.record.releaseId, {
      replay: async () => {
        throw new Error('Cannot reproduce');
      },
    }),
  ).rejects.toThrow('Cannot reproduce');
  expect(store.objects.get('index.json')?.bytes).toEqual(before);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.deleted.every((key) => key === 'writer-lock.json')).toBe(true);
  expect(store.objects.has('writer-lock.json')).toBe(false);
  expect(
    JSON.parse(store.objects.get('staged.json')?.bytes.toString()).candidates,
  ).toEqual([b.record.releaseId]);
  const c = prepared('c');
  await retainPreparedRelease(store, c, a.record.releaseId, { replay });
  expect(store.objects.has(b.record.bundle.key)).toBe(false);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
  expect(store.objects.has(b.record.recipe.key)).toBe(true);
});

test('the publication entry point resumes pending cleanup without consulting the running checkout', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  await retainPreparedRelease(store, b, a.record.releaseId, { replay });
  const original = store.objects.get(a.record.recipe.key);
  store.objects.delete(a.record.recipe.key);
  await expect(
    retainPreparedRelease(store, c, b.record.releaseId, { replay }),
  ).rejects.toThrow('Missing retained object');
  await store.write(a.record.recipe.key, original.bytes, null);
  const root = await mkdtemp(join(tmpdir(), 'gtfs-cleanup-retry-'));
  roots.push(root);
  await writeFile(
    join(root, 'combined-pages.json'),
    JSON.stringify({ approvedRelease: { index: 'approved.json' } }),
  );
  await writeFile(
    join(root, 'approved.json'),
    JSON.stringify(c.record.releaseIndex),
  );
  const receipt = await retainPublishedRelease({
    store,
    publishedIndex: c.record.releaseIndex,
    inputDir: root,
    outputDir: join(root, 'receipt'),
    repo: '/does-not-exist/new-generator',
    replay,
  });
  expect(receipt).toMatchObject({
    action: 'cleanup-retried',
    pruned: [a.record.releaseId],
  });
  expect(await readFile(join(root, 'receipt/recipe.zip'))).toEqual(
    c.objects.get(c.record.recipe.key),
  );
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
  const writes = store.writes.length;
  await retainPublishedRelease({
    store,
    publishedIndex: c.record.releaseIndex,
    inputDir: root,
    outputDir: join(root, 'cached-receipt'),
    repo: '/does-not-exist/new-generator',
    replay,
  });
  expect(store.writes).toHaveLength(writes);
});

test('an index write failure leaves a discoverable candidate for the next successful promotion', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  const write = store.write.bind(store);
  store.write = async (key, bytes, etag) => {
    if (
      key === 'index.json' &&
      JSON.parse(bytes.toString()).current === b.record.releaseId
    )
      throw new Error('Promotion interrupted');
    return write(key, bytes, etag);
  };
  await expect(
    retainPreparedRelease(store, b, a.record.releaseId, { replay }),
  ).rejects.toThrow('Promotion interrupted');
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
  store.write = write;
  const result = await retainPreparedRelease(store, c, a.record.releaseId, {
    replay,
  });
  expect(result.pruned).toEqual([b.record.releaseId]);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
  expect(
    JSON.parse(store.objects.get('staged.json')?.bytes.toString()).candidates,
  ).toEqual([]);
});

test('reviewed rollback reuses the original retained recipe without a working current generator', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  await retainPreparedRelease(store, b, a.record.releaseId, { replay });
  await retainPreparedRelease(store, c, b.record.releaseId, { replay });
  const root = await mkdtemp(join(tmpdir(), 'gtfs-retained-rollback-'));
  roots.push(root);
  await writeFile(
    join(root, 'combined-pages.json'),
    JSON.stringify({ approvedRelease: { index: 'approved.json' } }),
  );
  await writeFile(
    join(root, 'approved.json'),
    JSON.stringify(b.record.releaseIndex),
  );
  const result = await retainPublishedRelease({
    store,
    publishedIndex: b.record.releaseIndex,
    inputDir: root,
    outputDir: join(root, 'receipt'),
    repo: '/does-not-exist/new-generator',
    replay,
  });
  expect(result).toMatchObject({
    current: b.record.releaseId,
    previous: c.record.releaseId,
  });
  expect(await readFile(join(root, 'receipt/recipe.zip'))).toEqual(
    b.objects.get(b.record.recipe.key),
  );
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
});

test('an unreproducible abandoned candidate stays pending until a stored-input cleanup retry succeeds', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  const failB = async (bytes: Buffer) => {
    if (bytes.toString() === 'b') throw new Error('Missing original generator');
    return replay(bytes);
  };
  await expect(
    retainPreparedRelease(store, b, a.record.releaseId, { replay: failB }),
  ).rejects.toThrow('Missing original generator');
  await expect(
    retainPreparedRelease(store, c, a.record.releaseId, { replay: failB }),
  ).rejects.toThrow('Missing original generator');
  expect(
    JSON.parse(store.objects.get('index.json')?.bytes.toString()),
  ).toMatchObject({
    current: c.record.releaseId,
    previous: a.record.releaseId,
    prunePending: [b.record.releaseId],
  });
  const result = await resumeCurrentRetainedRelease(
    store,
    c.record.releaseIndex,
    { replay },
  );
  expect(result.pruned).toEqual([b.record.releaseId]);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.has(c.record.bundle.key)).toBe(true);
});

test('cleanup rechecks the current release under its lock before using stored inputs', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b');
  await retainPreparedRelease(store, a, null, { replay });
  const write = store.write.bind(store);
  let interrupt = true;
  store.write = async (key, bytes, etag) => {
    if (key === 'writer-lock.json' && interrupt) {
      interrupt = false;
      await retainPreparedRelease(store, b, a.record.releaseId, { replay });
    }
    return write(key, bytes, etag);
  };
  await expect(
    resumeCurrentRetainedRelease(store, a.record.releaseIndex, { replay }),
  ).rejects.toThrow('incumbent changed');
  expect(
    JSON.parse(store.objects.get('index.json')?.bytes.toString()).current,
  ).toBe(b.record.releaseId);
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
});

test('missing historical inputs prevent deletion, and retries complete pruning after repair', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b'),
    c = prepared('c');
  await retainPreparedRelease(store, a, null, { replay });
  await retainPreparedRelease(store, b, a.record.releaseId, { replay });
  store.objects.delete(a.record.recipe.key);
  await expect(
    retainPreparedRelease(store, c, b.record.releaseId, { replay }),
  ).rejects.toThrow('Missing retained object');
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.has(b.record.bundle.key)).toBe(true);
  await store.write(
    a.record.recipe.key,
    a.objects.get(a.record.recipe.key) ?? Buffer.alloc(0),
    null,
  );
  const result = await retainPreparedRelease(store, c, c.record.releaseId, {
    replay,
  });
  expect(result.pruned).toEqual([a.record.releaseId]);
});

test('incumbent changes and concurrent writers preserve ready bundles', async () => {
  const store = memoryStore();
  const a = prepared('a'),
    b = prepared('b');
  await retainPreparedRelease(store, a, null, { replay });
  await expect(
    retainPreparedRelease(store, b, null, { replay }),
  ).rejects.toThrow('incumbent changed');
  await store.write('writer-lock.json', Buffer.from('other writer'), null);
  await expect(
    retainPreparedRelease(store, b, a.record.releaseId, { replay }),
  ).rejects.toThrow('Conditional write failed');
  expect(store.objects.has(a.record.bundle.key)).toBe(true);
  expect(store.objects.get('writer-lock.json')?.bytes.toString()).toBe(
    'other writer',
  );
});
