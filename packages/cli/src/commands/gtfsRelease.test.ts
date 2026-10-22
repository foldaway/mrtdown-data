import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hashBytes,
  prepareVerifiedGtfsTimetableArtifact,
  verifyScheduledTimetableArtifact,
} from '@mrtdown/fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewedReleaseFixture } from '../../../fs/src/gtfs/__tests__/releaseFixture.js';
import { gtfsLicenceReference } from '../gtfsTerms.js';
import { runCli } from '../index.js';

const bodies = {
  licence: 'Synthetic licence',
  apiTerms: 'Synthetic API terms',
};
const terms = {
  licence: {
    reference: gtfsLicenceReference,
    sha256: hashBytes(Buffer.from(bodies.licence)),
  },
  apiTerms: {
    reference:
      'https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html',
    sha256: hashBytes(Buffer.from(bodies.apiTerms)),
  },
};
const args = [
  'gtfs',
  'release',
  '--file',
  'schedule.zip',
  '--capture',
  'capture.json',
  '--config',
  'review/config.json',
];

async function fixture(root: string) {
  const {
    currentTerms: _terms,
    releaseInstant: _instant,
    releaseReview,
    ...options
  } = await reviewedReleaseFixture(root, true);
  options.currentLicenceReference = gtfsLicenceReference;
  const prepared = await prepareVerifiedGtfsTimetableArtifact(
    join(root, 'schedule.zip'),
    join(root, 'capture.json'),
    options,
  );
  releaseReview.manifestSha256 = prepared.manifestSha256;
  releaseReview.terms = terms;
  const config = {
    schemaVersion: 1,
    canonicalCommit: options.canonicalCommit,
    mappingVersion: options.mappingVersion,
    correctionRevision: options.correctionRevision,
    currentLicenceReference: gtfsLicenceReference,
    draft: 'draft.json',
    mappingApproval: 'approval.json',
    releaseReview: 'release-review.json',
  };
  await mkdir(join(root, 'review'));
  for (const [name, record] of Object.entries({
    'config.json': config,
    'draft.json': options.draft,
    'approval.json': options.mappingApproval,
    'release-review.json': releaseReview,
  })) {
    await writeFile(join(root, 'review', name), JSON.stringify(record));
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async (url) =>
        new Response(
          String(url) === gtfsLicenceReference
            ? bodies.licence
            : bodies.apiTerms,
        ),
    );
  vi.stubGlobal('fetch', fetcher);
  const output: string[] = [],
    errors: string[] = [];
  return {
    config,
    fetcher,
    output,
    errors,
    io: {
      stdout: (text: string) => output.push(text),
      stderr: (text: string) => errors.push(text),
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('GTFS release CLI', () => {
  it('checks without writing and exports a verifiable reviewed bundle on request, fetching current terms for each attempt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-cli-'));
    try {
      const { output, errors, io, fetcher } = await fixture(root);
      const before = await readdir(root);
      expect(await runCli(args, io, root)).toBe(0);
      const check = JSON.parse(output[0]);
      expect(check).toMatchObject({
        exported: false,
        release: { eligible: true },
        currentTerms: terms,
      });
      expect(check.release.releaseInstant).toBeTruthy();
      expect(await readdir(root)).toEqual(before);
      expect(await runCli([...args, '--out', 'bundle'], io, root)).toBe(0);
      const report = JSON.parse(output[1]);
      expect(report.exported).toBe(true);
      expect(report.manifestSha256).toBe(check.manifestSha256);
      verifyScheduledTimetableArtifact(
        await readFile(join(root, 'bundle/manifest.json')),
        report.manifestSha256,
        {
          timetableBytes: await readFile(join(root, 'bundle/timetable.json')),
          noticeBytes: await readFile(join(root, 'bundle/NOTICE.txt')),
        },
      );
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(errors).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a failing status with blockers and writes nothing when terms change or review is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-cli-blocked-'));
    try {
      const { output, io, fetcher, config } = await fixture(root);
      fetcher.mockImplementation(async () => new Response('Changed terms'));
      expect(await runCli([...args, '--out', 'bundle'], io, root)).toBe(1);
      expect(JSON.parse(output[0]).release.blockers).toContain(
        'Release review does not match current terms',
      );
      await writeFile(
        join(root, 'review/config.json'),
        JSON.stringify({
          ...config,
          mappingApproval: undefined,
          releaseReview: undefined,
        }),
      );
      expect(await runCli([...args, '--out', 'bundle'], io, root)).toBe(1);
      expect(JSON.parse(output[1]).release.blockers).toEqual([
        'Mapping review is not complete',
        'Release review is missing',
      ]);
      await expect(readdir(join(root, 'bundle'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses untrusted configuration overrides and network failure before output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gtfs-release-cli-errors-'));
    try {
      const { config, output, errors, io, fetcher } = await fixture(root);
      for (const override of [
        { currentTerms: terms },
        { releaseInstant: '2026-01-20T00:00:00Z' },
        { currentLicenceReference: 'https://example.test/terms' },
      ]) {
        await writeFile(
          join(root, 'review/config.json'),
          JSON.stringify({ ...config, ...override }),
        );
        expect(await runCli([...args, '--out', 'bundle'], io, root)).toBe(1);
      }
      expect(await runCli([...args, '--write', 'report.json'], io, root)).toBe(
        1,
      );
      expect(errors.at(-1)).toContain('Unexpected GTFS release arguments');
      expect(fetcher).not.toHaveBeenCalled();
      await writeFile(join(root, 'review/config.json'), JSON.stringify(config));
      fetcher.mockRejectedValue(new Error('Synthetic download failure'));
      expect(await runCli([...args, '--out', 'bundle'], io, root)).toBe(1);
      expect(errors.at(-1)).toContain('Synthetic download failure');
      expect(output).toEqual([]);
      await expect(readdir(join(root, 'bundle'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
