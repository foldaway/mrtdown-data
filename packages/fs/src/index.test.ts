import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceSchema } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import {
  buildIssueId,
  buildManifest,
  createIssueBundle,
  issuePathFromId,
  listEntityIds,
  readIssueBundle,
  readNdjsonFile,
  renderPagesIndex,
  toDataPath,
  validateDataRoot,
} from './index.js';

const fixtureDataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/data',
);

describe('@mrtdown/fs', () => {
  it('reads target-layout fixtures through core schemas', async () => {
    await expect(listEntityIds(fixtureDataDir, 'line')).resolves.toEqual([
      'SLL',
      'TGL',
    ]);

    const bundle = await readIssueBundle(
      fixtureDataDir,
      '2026-01-01-tgl-train-fault',
    );

    expect(bundle.issue.title['en-SG']).toBe('Tengah Line Train Fault');
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.impactEvents).toHaveLength(8);
  });

  it('validates fixtures and builds a manifest', async () => {
    const result = await validateDataRoot(fixtureDataDir);
    expect(result).toMatchObject({
      ok: true,
      checked: {
        issue: 2,
        landmark: 0,
        line: 2,
        operator: 0,
        service: 4,
        station: 17,
        town: 0,
      },
    });

    const manifest = await buildManifest(
      fixtureDataDir,
      '2026-01-01T00:00:00Z',
    );
    expect(manifest.lines).toMatchObject({
      TGL: 'line/TGL.json',
    });
    expect(renderPagesIndex(manifest)).toContain('MRTDown data');
  });

  it('creates append-only issue folders', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const id = buildIssueId('2026-05-12', 'Signal Fault at Test Station');

    const bundle = await createIssueBundle(dataDir, {
      id,
      title: 'Signal Fault at Test Station',
    });

    expect(bundle.issue.id).toBe('2026-05-12-signal-fault-at-test-station');
    await expect(
      readFile(
        join(
          dataDir,
          'issue',
          '2026',
          '05',
          '2026-05-12-signal-fault-at-test-station',
          'evidence.ndjson',
        ),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('claims issue folders atomically', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const id = buildIssueId('2026-05-12', 'Duplicate Signal Fault');
    const input = {
      id,
      title: 'Duplicate Signal Fault',
    };

    const results = await Promise.allSettled([
      createIssueBundle(dataDir, input),
      createIssueBundle(dataDir, input),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(createIssueBundle(dataDir, input)).rejects.toThrow(
      `Issue already exists: ${id}`,
    );
  });

  it('normalizes data paths consistently', () => {
    expect(toDataPath(String.raw`station\\promenade.json`)).toBe(
      'station/promenade.json',
    );
    expect(toDataPath('issue/2024/01/../02//test')).toBe('issue/2024/02/test');
  });

  it('reports invalid issue id format clearly', () => {
    expect(() => issuePathFromId(fixtureDataDir, 'missing-month')).toThrow(
      'expected format: YYYY-MM-DD-<slug>',
    );
  });

  it('reports NDJSON parse failures with physical line numbers', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const path = join(dataDir, 'records.ndjson');
    await writeFile(
      path,
      '{"id":"ev_1","type":"report.public","ts":"2026-05-12T00:00:00+08:00","text":"ok","render":null,"sourceUrl":"https://example.com"}\n\nnot-json\n',
    );

    await expect(readNdjsonFile(path, EvidenceSchema)).rejects.toThrow(
      `Invalid NDJSON in ${path} at line 3`,
    );
  });
});
