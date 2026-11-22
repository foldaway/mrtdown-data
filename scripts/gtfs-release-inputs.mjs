import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { unzipSync, zipSync } from 'fflate';
import z from 'zod';
import {
  CombinedTimetableReleaseIndexSchema,
  hashBytes,
} from '../packages/fs/dist/index.js';

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const descriptor = z
  .object({
    key: z.string().min(1),
    sha256: sha256Schema,
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
export const recipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    documentKind: z.literal('gtfs-release-recipe'),
    releaseIndex: CombinedTimetableReleaseIndexSchema,
    canonicalCommit: z.string().regex(/^[a-f0-9]{40}$/),
    generatorCommit: z.string().regex(/^[a-f0-9]{40}$/),
    packageLockSha256: sha256Schema,
    nodeVersion: z.string().min(1),
    source: descriptor,
    canonical: descriptor,
    generator: descriptor,
    files: z.record(
      z.string(),
      z
        .object({
          sha256: sha256Schema,
          byteLength: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export const releaseId = (index) =>
  hashBytes(
    Buffer.from(
      JSON.stringify(CombinedTimetableReleaseIndexSchema.parse(index)),
    ),
  );
export const objectDescriptor = (kind, bytes, extension) => ({
  key: `${kind}/${hashBytes(bytes)}.${extension}`,
  sha256: hashBytes(bytes),
  byteLength: bytes.length,
});
export function verifyObject(bytes, expected) {
  if (
    bytes.length !== expected.byteLength ||
    hashBytes(bytes) !== expected.sha256
  )
    throw new Error(
      `Retained object hash/size mismatch: ${expected.key ?? 'recipe file'}`,
    );
  return bytes;
}
export function deterministicZip(files) {
  return Buffer.from(
    // ZIP stores local calendar fields rather than an absolute timestamp.
    zipSync(files, { level: 9, mtime: new Date(2000, 0, 1, 0, 0, 0) }),
  );
}
export function revisionArchive(repo, revision, paths) {
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error('Expected full Git revision');
  return gzipSync(
    execFileSync('git', ['archive', '--format=tar', revision, ...paths], {
      cwd: repo,
      maxBuffer: 128 * 1024 * 1024,
    }),
    { level: 9 },
  );
}
/** Only extract verified Git-produced tar archives; reject aliases/traversal first. */
export function extractRevision(bytes, directory) {
  const tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const string = (start, length) =>
      header
        .subarray(start, start + length)
        .toString()
        .split('\0')[0];
    const name = [string(345, 155), string(0, 100)].filter(Boolean).join('/');
    const type = string(156, 1);
    const size = Number.parseInt(string(124, 12).trim() || '0', 8);
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      isAbsolute(name) ||
      name.split('/').includes('..') ||
      name.includes('\\') ||
      !['', '0', '5', 'g'].includes(type)
    )
      throw new Error('Unsafe retained revision archive');
    if (
      type === 'g' &&
      !/^\d+ comment=[a-f0-9]{40}\n$/.test(
        tar.subarray(offset + 512, offset + 512 + size).toString(),
      )
    )
      throw new Error('Unsafe retained Git archive metadata');
    offset += 512 + Math.ceil(size / 512) * 512;
    if (offset > tar.length)
      throw new Error('Truncated retained revision archive');
  }
  execFileSync(
    'tar',
    ['-xf', '-', '-C', directory, '--no-same-owner', '--no-same-permissions'],
    { input: tar },
  );
}
export function decodeRecipe(bytes) {
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (!/^[A-Za-z][A-Za-z0-9-]*\.json$/.test(file.name))
        throw new Error('Unsafe recipe entry');
      expanded += file.originalSize;
      if (expanded > 16 * 1024 * 1024)
        throw new Error('Recipe exceeds expanded size limit');
      return true;
    },
  });
  const recipe = recipeSchema.parse(
    JSON.parse(Buffer.from(files['recipe.json'] ?? []).toString()),
  );
  const expectedNames = [...Object.keys(recipe.files), 'recipe.json'].sort();
  if (
    JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(expectedNames)
  )
    throw new Error('Recipe file inventory differs');
  for (const [name, expected] of Object.entries(recipe.files))
    verifyObject(files[name], expected);
  return { recipe, files };
}
