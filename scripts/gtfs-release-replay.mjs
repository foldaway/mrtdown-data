import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CombinedTimetableReleaseIndexSchema,
  hashBytes,
} from '../packages/fs/dist/index.js';
import {
  decodeRecipe,
  extractRevision,
  releaseId,
  verifyObject,
} from './gtfs-release-inputs.mjs';

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

/** Build and execute only the verified generator, without publisher credentials. */
export function runRetainedGenerator({ code, inputs, canonical, root }) {
  const inherited = process.env;
  const env = Object.fromEntries(
    ['HOME', 'TMPDIR', 'TEMP', 'SystemRoot']
      .filter((name) => inherited[name])
      .map((name) => [name, inherited[name]]),
  );
  env.PATH = [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter);
  env.TZ = 'UTC';
  env.npm_config_update_notifier = 'false';
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const options = {
    cwd: code,
    env,
    timeout: 300000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  execFileSync(
    npm,
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    options,
  );
  execFileSync(npm, ['run', 'build:cli'], options);
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('./run-retained-gtfs-generator.mjs', import.meta.url),
      ),
      code,
      inputs,
      canonical,
      root,
    ],
    options,
  );
}

/** Replay retained evidence using its own generator; this never authorizes publication. */
export async function replayReleaseRecipe(recipeBytes, getObject) {
  const { recipe, files } = decodeRecipe(recipeBytes);
  const root = await mkdtemp(join(tmpdir(), 'gtfs-release-replay-'));
  try {
    const inputs = join(root, 'inputs');
    const canonical = join(root, 'canonical');
    await mkdir(inputs);
    await mkdir(canonical);
    for (const [name, bytes] of Object.entries(files))
      if (name !== 'recipe.json')
        await writeFile(join(inputs, name), bytes, { flag: 'wx' });
    const source = verifyObject(
      await getObject(recipe.source.key),
      recipe.source,
    );
    const canonicalBytes = verifyObject(
      await getObject(recipe.canonical.key),
      recipe.canonical,
    );
    const generatorBytes = verifyObject(
      await getObject(recipe.generator.key),
      recipe.generator,
    );
    // Verify that the saved generator includes the exact dependency lock.
    const code = join(root, 'generator');
    await mkdir(code);
    extractRevision(generatorBytes, code);
    if (
      hashBytes(await readFile(join(code, 'package-lock.json'))) !==
      recipe.packageLockSha256
    )
      throw new Error('Retained generator dependency lock differs');
    extractRevision(canonicalBytes, canonical);
    await writeFile(join(inputs, 'schedule.zip'), source, { flag: 'wx' });
    runRetainedGenerator({
      code,
      inputs,
      canonical,
      root,
    });
    const { index: generatedIndex } = await json(
      join(root, 'generator-result.json'),
    );
    const index = CombinedTimetableReleaseIndexSchema.parse(generatedIndex);
    if (releaseId(index) !== releaseId(recipe.releaseIndex))
      throw new Error('Replayed release index differs from the recipe');
    const bundleFiles = { 'release-index.json': jsonBytes(index) };
    for (const name of ['manifest.json', 'timetable.json', 'release.json'])
      bundleFiles[name] = await readFile(
        join(canonical, 'data', 'combined-timetable', name),
      );
    if (
      hashBytes(bundleFiles['manifest.json']) !== index.manifestSha256 ||
      hashBytes(bundleFiles['release.json']) !== index.releaseSha256
    )
      throw new Error(
        'Retained generator output differs from the approved index',
      );
    const manifest = JSON.parse(bundleFiles['manifest.json'].toString());
    if (
      hashBytes(bundleFiles['timetable.json']) !== manifest.timetable.sha256 ||
      bundleFiles['timetable.json'].length !== manifest.timetable.byteLength
    )
      throw new Error(
        'Retained generator timetable differs from its approved manifest',
      );
    const outputs = Object.fromEntries(
      Object.entries(bundleFiles).map(([name, bytes]) => [
        name,
        { sha256: hashBytes(bytes), byteLength: bytes.length },
      ]),
    );
    return {
      recipe,
      manifest,
      bundleFiles,
      outputs,
      replay: {
        schemaVersion: 1,
        documentKind: 'gtfs-release-replay-proof',
        releaseId: releaseId(index),
        recipeSha256: hashBytes(recipeBytes),
        sourceSha256: recipe.source.sha256,
        canonicalSha256: recipe.canonical.sha256,
        generatorSha256: recipe.generator.sha256,
        outputs,
      },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
