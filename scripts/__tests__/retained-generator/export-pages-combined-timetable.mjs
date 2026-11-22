import { createHash } from 'node:crypto';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function prepareHistoricalCombinedTimetableReplay(options) {
  const built = JSON.parse(
    await readFile(new URL('../build-complete.json', import.meta.url), 'utf8'),
  );
  if (built.version !== 'retained-v1')
    throw new Error('Retained generator was not built');
  const expected = JSON.parse(
    await readFile(new URL('../expected-inputs.json', import.meta.url), 'utf8'),
  );
  const source = await readFile(options.gtfsFile);
  const capture = JSON.parse(await readFile(options.gtfsCapture, 'utf8'));
  const config = JSON.parse(await readFile(options.gtfsCombinedConfig, 'utf8'));
  if (hash(source) !== expected.sourceSha256)
    throw new Error('Retained fixture source differs');
  if (!isDeepStrictEqual(capture, expected.capture))
    throw new Error('Retained fixture capture differs');
  if (
    config.draftSha256 !== expected.draftSha256 ||
    config.canonicalCommit !== expected.canonicalCommit
  )
    throw new Error('Retained fixture config differs');
  const approvedIndex = JSON.parse(
    await readFile(
      resolve(
        dirname(options.gtfsCombinedConfig),
        config.approvedRelease.index,
      ),
      'utf8',
    ),
  );
  const evidence = await readFile(
    resolve(
      dirname(options.gtfsCombinedConfig),
      config.approvedRelease.evidence,
    ),
  );
  if (
    !isDeepStrictEqual(approvedIndex, expected.index) ||
    hash(evidence) !== expected.index.releaseSha256
  )
    throw new Error('Retained fixture approvals differ');
  return async (dataDir) => {
    const target = join(dataDir, 'combined-timetable');
    await mkdir(target);
    for (const name of ['manifest.json', 'timetable.json', 'release.json'])
      await cp(
        new URL('../approved-output/' + name, import.meta.url),
        join(target, name),
      );
    return {
      index: JSON.parse(
        await readFile(
          new URL('../approved-output/release-index.json', import.meta.url),
          'utf8',
        ),
      ),
      manifest: JSON.parse(
        await readFile(join(target, 'manifest.json'), 'utf8'),
      ),
    };
  };
}
