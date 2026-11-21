import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hashBytes } from '../packages/fs/dist/index.js';
import {
  deterministicZip,
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
        (id) => !isId(id) || id === value.current || id === value.previous,
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

/** A small journal also tracks bundles whose promotion never reached index.json. */
async function stagedCandidates(store) {
  const object = await store.read('staged.json');
  const value = object
    ? decode(object.bytes)
    : { schemaVersion: 1, candidates: [] };
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.candidates) ||
    value.candidates.some((id) => !isId(id)) ||
    new Set(value.candidates).size !== value.candidates.length
  )
    throw new Error('Invalid staged release journal');
  return { ...value, etag: object?.etag ?? null };
}
async function withWriterLock(store, operation) {
  const lock = encode({
    owner: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  const etag = await store.write('writer-lock.json', lock, null);
  try {
    return await operation();
  } finally {
    await store.remove('writer-lock.json', etag);
  }
}
async function storedRecord(store, id, verifyInputs = true) {
  const object = await store.read(`records/${id}.json`);
  if (!object) return null;
  const record = validateRecord(decode(object.bytes), id);
  if (verifyInputs) await checkInputs(store, record);
  return record;
}
function checkReplay(rebuilt, record) {
  if (
    rebuilt.replay?.releaseId !== record.releaseId ||
    !isDeepStrictEqual(rebuilt.outputs, record.outputs)
  )
    throw new Error(
      'Retained release replay differs; preserving ready bundles',
    );
}

/** Reuse recorded inputs even after the running checkout's generator changes. */
export async function readPreparedRetainedRelease(
  store,
  id,
  { replay = replayReleaseRecipe } = {},
) {
  const record = await storedRecord(store, id);
  if (!record) return null;
  const recipeBytes = (await required(store, record.recipe.key)).bytes;
  const ready = await store.read(record.bundle.key);
  let bundleBytes = ready?.bytes;
  if (!bundleBytes) {
    const rebuilt = await replay(
      recipeBytes,
      async (key) => (await required(store, key)).bytes,
    );
    checkReplay(rebuilt, record);
    bundleBytes = deterministicZip(rebuilt.bundleFiles);
  }
  verifyObject(bundleBytes, record.bundle);
  const objects = new Map(
    await Promise.all(
      [record.recipe, ...record.inputs].map(async (item) => [
        item.key,
        (await required(store, item.key)).bytes,
      ]),
    ),
  );
  return { record, recipeBytes, bundleBytes, objects };
}

/** Routine deployments reuse the first recipe and perform no storage writes. */
export async function alreadyRetainedRelease(store, publishedIndex) {
  const state = await store.read('index.json');
  if (!state) return null;
  const index = validateIndex(decode(state.bytes));
  const id = releaseId(publishedIndex);
  if (
    index.current !== id ||
    index.prunePending?.length ||
    (await stagedCandidates(store)).candidates.length
  )
    return null;
  const record = await storedRecord(store, id);
  if (!record) throw new Error('Current retained release record is missing');
  const bundle = await store.read(record.bundle.key);
  if (!bundle) return null;
  verifyObject(bundle.bytes, record.bundle);
  return {
    record,
    recipeBytes: (await required(store, record.recipe.key)).bytes,
    bundleBytes: bundle.bytes,
    current: id,
    previous: index.previous,
    action: 'already-current',
    pruned: [],
  };
}

/** A successful retained release is the sole baseline for unattended successors. */
export async function currentRetainedRelease(store) {
  const state = validateIndex(
    decode((await required(store, 'index.json')).bytes),
  );
  const record = await storedRecord(store, state.current);
  if (!record) throw new Error('Current retained release record is missing');
  const current = await alreadyRetainedRelease(store, record.releaseIndex);
  if (!current)
    throw new Error(
      'Current release is incomplete or retention cleanup is pending',
    );
  return current;
}

/** Called under the writer lock; every deletion is replay-checked and conditional. */
async function finishCleanup(store, index, replay) {
  const staged = await stagedCandidates(store);
  const pending = [
    ...new Set(
      [...(index.prunePending ?? []), ...staged.candidates].filter(
        (id) => id !== index.current && id !== index.previous,
      ),
    ),
  ];
  if (!isDeepStrictEqual(pending, index.prunePending ?? [])) {
    const observed = await required(store, 'index.json');
    const latest = validateIndex(decode(observed.bytes));
    if (!isDeepStrictEqual(latest, index))
      throw new Error('Retention index changed before cleanup');
    index = { ...index, prunePending: pending };
    await store.write('index.json', encode(index), observed.etag);
  }
  // Move abandoned candidates into durable pending cleanup before clearing staging.
  if (staged.candidates.length)
    await store.write(
      'staged.json',
      encode({ schemaVersion: 1, candidates: [] }),
      staged.etag,
    );
  const pruned = [];
  for (const oldId of pending) {
    const old = await storedRecord(store, oldId, false);
    if (!old) throw new Error('Pending retained release record is missing');
    const bundle = await store.read(old.bundle.key);
    if (!bundle) continue;
    verifyObject(bundle.bytes, old.bundle);
    await checkInputs(store, old);
    const rebuilt = await replay(
      (await required(store, old.recipe.key)).bytes,
      async (key) => (await required(store, key)).bytes,
    );
    checkReplay(rebuilt, old);
    const incumbent = validateIndex(
      decode((await required(store, 'index.json')).bytes),
    );
    if (
      incumbent.current !== index.current ||
      incumbent.previous !== index.previous
    )
      throw new Error('Retention index changed during pruning');
    await store.remove(old.bundle.key, bundle.etag);
    pruned.push(oldId);
  }
  if (pending.length) {
    const observed = await required(store, 'index.json');
    const latest = validateIndex(decode(observed.bytes));
    if (!isDeepStrictEqual(latest, index))
      throw new Error('Retention index changed before cleanup completed');
    await store.write(
      'index.json',
      encode({ ...index, prunePending: [] }),
      observed.etag,
    );
  }
  return pruned;
}

/** Cleanup retries use the stored current recipe, never the newer checkout. */
export async function resumeCurrentRetainedRelease(
  store,
  publishedIndex,
  { replay = replayReleaseRecipe } = {},
) {
  const state = await store.read('index.json');
  const id = releaseId(publishedIndex);
  if (!state || validateIndex(decode(state.bytes)).current !== id) return null;
  return withWriterLock(store, async () => {
    const index = validateIndex(
      decode((await required(store, 'index.json')).bytes),
    );
    if (index.current !== id)
      throw new Error('Retention incumbent changed before cleanup retry');
    const prepared = await readPreparedRetainedRelease(store, id, { replay });
    if (!prepared)
      throw new Error('Current retained release record is missing');
    await immutable(store, prepared.record.bundle.key, prepared.bundleBytes);
    const pruned = await finishCleanup(store, index, replay);
    return {
      ...prepared,
      current: id,
      previous: index.previous,
      action: 'cleanup-retried',
      pruned,
    };
  });
}

/** Serialized promotion. Failed replay never changes the incumbent or prunes. */
export async function retainPreparedRelease(
  store,
  prepared,
  expectedCurrent,
  { replay = replayReleaseRecipe } = {},
) {
  return withWriterLock(store, async () => {
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
    const prior = await storedRecord(store, id);
    const record = prior ?? prepared.record;
    if (hashBytes(prepared.bundleBytes) !== record.bundle.sha256)
      throw new Error(
        'Same release identity produced different ready-bundle bytes',
      );
    if (!prior) await immutable(store, recordKey, encode(record));
    const staged = await stagedCandidates(store);
    if (!staged.candidates.includes(id))
      await store.write(
        'staged.json',
        encode({ schemaVersion: 1, candidates: [...staged.candidates, id] }),
        staged.etag,
      );
    await immutable(store, record.bundle.key, prepared.bundleBytes);
    const candidate = await replay(
      (await required(store, record.recipe.key)).bytes,
      async (key) => (await required(store, key)).bytes,
    );
    checkReplay(candidate, record);
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
    const pruned = await finishCleanup(store, next, replay);
    return {
      current: next.current,
      previous: next.previous,
      action: index?.current === id ? 'already-current' : 'promoted',
      pruned,
    };
  });
}

export { s3ReleaseStore } from './gtfs-release-object-store.mjs';
