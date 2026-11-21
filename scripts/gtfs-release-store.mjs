import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { hashBytes } from '../packages/fs/dist/index.js';
import {
  releaseId,
  replayReleaseRecipe,
  verifyObject,
} from './gtfs-release-recipe.mjs';

const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const decode = (bytes) => JSON.parse(bytes.toString('utf8'));
const isId = (id) => /^[a-f0-9]{64}$/.test(id);
function validateIndex(value) {
  if (
    value?.schemaVersion !== 1 ||
    !isId(value.current) ||
    (value.previous !== null && !isId(value.previous)) ||
    !Array.isArray(value.releases) ||
    value.releases.some((id) => !isId(id)) ||
    new Set(value.releases).size !== value.releases.length ||
    !value.releases.includes(value.current) ||
    (value.previous !== null &&
      (!value.releases.includes(value.previous) ||
        value.previous === value.current))
  )
    throw new Error('Invalid release retention index');
  if (
    value.prunePending !== undefined &&
    (!Array.isArray(value.prunePending) ||
      value.prunePending.some(
        (id) =>
          !isId(id) ||
          !value.releases.includes(id) ||
          id === value.current ||
          id === value.previous,
      ))
  )
    throw new Error('Invalid pending retention cleanup');
  return value;
}
function validateRecord(record, id) {
  if (
    record?.schemaVersion !== 1 ||
    record.documentKind !== 'gtfs-retained-release' ||
    record.releaseId !== id ||
    releaseId(record.releaseIndex) !== id ||
    record.replay?.releaseId !== id ||
    record.replay?.recipeSha256 !== record.recipe?.sha256 ||
    !Array.isArray(record.inputs) ||
    record.inputs.length !== 3 ||
    record.bundle?.key !== `bundles/${id}.zip`
  )
    throw new Error('Invalid retained release record');
  for (const item of [record.recipe, record.bundle, ...record.inputs]) {
    if (
      !/^(sources|canonical|generators|recipes|bundles)\/[a-f0-9]{64}\.(zip|tar\.gz)$/.test(
        item.key,
      ) ||
      !isId(item.sha256) ||
      !Number.isSafeInteger(item.byteLength) ||
      item.byteLength < 0
    )
      throw new Error('Invalid retained object descriptor');
  }
  return record;
}
async function required(store, key) {
  const object = await store.read(key);
  if (!object) throw new Error(`Missing retained object: ${key}`);
  return object;
}
async function immutable(store, key, bytes) {
  const existing = await store.read(key);
  if (existing) {
    if (hashBytes(existing.bytes) !== hashBytes(bytes))
      throw new Error(`Immutable object already has different bytes: ${key}`);
  } else await store.write(key, bytes, null);
  if (hashBytes((await required(store, key)).bytes) !== hashBytes(bytes))
    throw new Error(`Retained object readback differs: ${key}`);
}
async function checkInputs(store, record) {
  for (const item of [record.recipe, ...record.inputs])
    verifyObject((await required(store, item.key)).bytes, item);
}

/** Routine deployments reuse the original recipe instead of snapshotting each new code commit. */
export async function alreadyRetainedRelease(store, publishedIndex) {
  const state = await store.read('index.json');
  if (!state) return null;
  const index = validateIndex(decode(state.bytes));
  const id = releaseId(publishedIndex);
  if (index.current !== id || index.prunePending?.length) return null;
  const record = validateRecord(
    decode((await required(store, `records/${id}.json`)).bytes),
    id,
  );
  await checkInputs(store, record);
  const bundle = await store.read(record.bundle.key);
  if (!bundle) return null;
  verifyObject(bundle.bytes, record.bundle);
  return {
    record,
    recipeBytes: (await required(store, record.recipe.key)).bytes,
    current: id,
    previous: index.previous,
    action: 'already-current',
    pruned: [],
  };
}

/** Serialized promotion. A failed replay, write, readback, or CAS never prunes. */
export async function retainPreparedRelease(
  store,
  prepared,
  expectedCurrent,
  { replay = replayReleaseRecipe } = {},
) {
  const lock = encode({
    owner: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  const lockEtag = await store.write('writer-lock.json', lock, null);
  try {
    const state = await store.read('index.json');
    const index = state ? validateIndex(decode(state.bytes)) : null;
    const id = prepared.record.releaseId;
    validateRecord(prepared.record, id);
    verifyObject(prepared.bundleBytes, prepared.record.bundle);
    for (const item of [prepared.record.recipe, ...prepared.record.inputs]) {
      if (!prepared.objects.has(item.key))
        throw new Error('Prepared recipe is missing an input');
      verifyObject(prepared.objects.get(item.key), item);
    }
    if (prepared.objects.size !== prepared.record.inputs.length + 1)
      throw new Error('Unexpected prepared objects');
    if (index?.current !== id && (index?.current ?? null) !== expectedCurrent)
      throw new Error(
        'Retention incumbent changed; inspect the current index before retrying',
      );
    for (const [key, bytes] of prepared.objects)
      await immutable(store, key, bytes);
    const recordKey = `records/${id}.json`;
    const prior = await store.read(recordKey);
    let record = prepared.record;
    if (prior) {
      record = validateRecord(decode(prior.bytes), id);
      await checkInputs(store, record);
      if (hashBytes(prepared.bundleBytes) !== record.bundle.sha256)
        throw new Error(
          'Same release identity produced different ready-bundle bytes',
        );
    } else await immutable(store, recordKey, encode(record));
    await immutable(store, record.bundle.key, prepared.bundleBytes);
    const candidate = await replay(
      (await required(store, record.recipe.key)).bytes,
      async (key) => (await required(store, key)).bytes,
    );
    if (
      candidate.replay?.releaseId !== id ||
      !isDeepStrictEqual(candidate.outputs, record.outputs)
    )
      throw new Error('Retained candidate replay differs; incumbent preserved');
    const next =
      index?.current === id
        ? index
        : {
            schemaVersion: 1,
            current: id,
            previous: index?.current ?? null,
            releases: [
              ...(index?.releases ?? []).filter((entry) => entry !== id),
              id,
            ],
            prunePending: [
              ...new Set(
                [...(index?.prunePending ?? []), index?.previous].filter(
                  (oldId) => oldId && oldId !== id && oldId !== index?.current,
                ),
              ),
            ],
          };
    if (next !== index)
      await store.write('index.json', encode(next), state?.etag ?? null);
    const pruned = [];
    for (const oldId of next.prunePending ?? []) {
      if (oldId === next.current || oldId === next.previous) continue;
      const old = validateRecord(
        decode((await required(store, `records/${oldId}.json`)).bytes),
        oldId,
      );
      const bundle = await store.read(old.bundle.key);
      if (!bundle) continue;
      verifyObject(bundle.bytes, old.bundle);
      await checkInputs(store, old);
      const recipe = (await required(store, old.recipe.key)).bytes;
      const rebuilt = await replay(
        recipe,
        async (key) => (await required(store, key)).bytes,
      );
      if (
        rebuilt.replay?.releaseId !== oldId ||
        !isDeepStrictEqual(rebuilt.outputs, old.outputs)
      )
        throw new Error(
          'Historical replay differs; preserving its ready bundle',
        );
      // The writer lock covers the index check and deletion, including rollback.
      const incumbent = validateIndex(
        decode((await required(store, 'index.json')).bytes),
      );
      if (
        incumbent.current !== next.current ||
        incumbent.previous !== next.previous
      )
        throw new Error('Retention index changed during pruning');
      await store.remove(old.bundle.key, bundle.etag);
      pruned.push(oldId);
    }
    if (next.prunePending?.length) {
      const observed = await required(store, 'index.json');
      const latest = validateIndex(decode(observed.bytes));
      if (latest.current !== next.current || latest.previous !== next.previous)
        throw new Error('Retention index changed before cleanup completed');
      await store.write(
        'index.json',
        encode({ ...next, prunePending: [] }),
        observed.etag,
      );
    }
    return {
      current: next.current,
      previous: next.previous,
      action: index?.current === id ? 'already-current' : 'promoted',
      pruned,
    };
  } finally {
    await store.remove('writer-lock.json', lockEtag);
  }
}

/** Dedicated prefix only. Existing Pages read credentials remain unchanged. */
export function s3ReleaseStore({
  bucket,
  prefix = 'gtfs-release-history',
  credentials,
  client,
}) {
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    prefix !== 'gtfs-release-history'
  )
    throw new Error('Expected the dedicated private release-retention prefix');
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: 'https://t3.storage.dev',
      forcePathStyle: true,
      credentials,
    });
  function key(value) {
    if (
      !/^(index\.json|writer-lock\.json|(sources|canonical|generators|recipes|records|bundles)\/[a-f0-9]{64}\.(json|zip|tar\.gz))$/.test(
        value,
      )
    )
      throw new Error('Key is outside the retention layout');
    if (/^sources\/[a-f0-9]{64}\.zip$/.test(value))
      return `blobs/schedule/${value.slice('sources/'.length)}`;
    return `${prefix}/${value}`;
  }
  return {
    async read(value) {
      try {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key(value) }),
        );
        return {
          bytes: Buffer.from(await result.Body.transformToByteArray()),
          etag: result.ETag,
        };
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
    async write(value, bytes, etag) {
      if (value.startsWith('sources/'))
        throw new Error(
          'Missing crawler source; retain it through the capture pipeline before archiving a release',
        );
      const result = await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key(value),
          Body: bytes,
          ContentType: value.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
          ...(etag === null ? { IfNoneMatch: '*' } : { IfMatch: etag }),
        }),
      );
      if (!result.ETag)
        throw new Error('Retention write returned no object identity');
      return result.ETag;
    },
    async remove(value, etag) {
      if (value !== 'writer-lock.json' && !value.startsWith('bundles/'))
        throw new Error(
          'Only ready bundles and the owned writer lock may be removed',
        );
      if (!etag)
        throw new Error(
          'Conditional deletion requires the observed object identity',
        );
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key(value),
          IfMatch: etag,
        }),
      );
    },
  };
}
