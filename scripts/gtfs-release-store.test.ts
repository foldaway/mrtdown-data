import { expect, test } from 'vitest';
import { hashBytes } from '../packages/fs/src/gtfs/capture.js';
import { objectDescriptor, releaseId } from './gtfs-release-recipe.mjs';
import {
  alreadyRetainedRelease,
  retainPreparedRelease,
  s3ReleaseStore,
} from './gtfs-release-store.mjs';

function memoryStore() {
  const objects = new Map<string, { bytes: Buffer; etag: string }>();
  const deleted: string[] = [];
  return {
    objects,
    deleted,
    async read(key: string) {
      return objects.get(key) ?? null;
    },
    async write(key: string, bytes: Buffer, expected: string | null) {
      if ((objects.get(key)?.etag ?? null) !== expected)
        throw new Error('Conditional write failed');
      const etag = hashBytes(bytes);
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
    ...objectDescriptor('bundles', bytes, 'zip'),
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
  return { record, objects, bundleBytes: bytes };
}
const replay = async (bytes: Buffer) => ({
  replay: { releaseId: prepared(bytes.toString()).record.releaseId },
  outputs: {
    'timetable.json': { sha256: hashBytes(bytes), byteLength: bytes.length },
  },
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

test('S3 adapter reuses crawler source blobs, scopes writes, and sends conditional operations', async () => {
  const commands: { input: Record<string, unknown> }[] = [];
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      commands.push(command);
      return {
        ETag: 'observed',
        Body: { transformToByteArray: async () => Buffer.from('bytes') },
      };
    },
  };
  const store = s3ReleaseStore({ bucket: 'test-bucket', client });
  const hash = 'a'.repeat(64);
  await store.read(`sources/${hash}.zip`);
  expect(commands.at(-1)?.input.Key).toBe(`blobs/schedule/${hash}.zip`);
  await expect(
    store.write(`sources/${hash}.zip`, Buffer.from('no'), null),
  ).rejects.toThrow('capture pipeline');
  await store.write('index.json', Buffer.from('{}'), null);
  expect(commands.at(-1)?.input.IfNoneMatch).toBe('*');
  await store.write('index.json', Buffer.from('{}'), 'old');
  expect(commands.at(-1)?.input.IfMatch).toBe('old');
  await expect(store.remove(`recipes/${hash}.zip`, 'observed')).rejects.toThrow(
    'Only ready bundles',
  );
  await store.remove(`bundles/${hash}.zip`, 'observed');
  expect(commands.at(-1)?.input.IfMatch).toBe('observed');
});
