import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvidenceSchema } from '@mrtdown/core';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  buildIssueId,
  buildManifest,
  createIssueBundle,
  FileStore,
  FileWriteStore,
  IdGenerator,
  issuePathFromId,
  listEntityIds,
  MRTDownRepository,
  MRTDownWriter,
  readIssueBundle,
  readNdjsonFile,
  renderPagesIndex,
  StandardRepository,
  toDataPath,
  validateDataRoot,
  visibleDirEntries,
  writeUnknownEntity,
} from './index.js';
import { StandardWriter } from './write/common/StandardWriter.js';

const fixtureDataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/data',
);

class FailingSecondImpactStore extends FileWriteStore {
  private impactAppendCount = 0;

  override appendText(path: string, text: string): void {
    if (path.endsWith('impact.ndjson')) {
      this.impactAppendCount += 1;
      if (this.impactAppendCount === 2) {
        throw new Error('Simulated impact write failure');
      }
    }
    super.appendText(path, text);
  }
}

class FailingReadStore extends FileWriteStore {
  override readText(path: string): string {
    if (path.endsWith('evidence.ndjson')) {
      const error = new Error(
        'Simulated read failure',
      ) as NodeJS.ErrnoException;
      error.code = 'EIO';
      throw error;
    }
    return super.readText(path);
  }
}

class FailingRollbackStore extends FailingSecondImpactStore {
  private failRestore = false;
  impactRestoreAttempted = false;

  override appendText(path: string, text: string): void {
    try {
      super.appendText(path, text);
    } catch (error) {
      this.failRestore = true;
      throw error;
    }
  }

  override writeText(path: string, text: string): void {
    if (this.failRestore && path.endsWith('evidence.ndjson')) {
      throw new Error('Simulated evidence rollback failure');
    }
    if (this.failRestore && path.endsWith('impact.ndjson')) {
      this.impactRestoreAttempted = true;
    }
    super.writeText(path, text);
  }
}

class StaleIssueJsonReadStore extends FileWriteStore {
  override readText(path: string): string {
    if (path.endsWith('issue.json')) {
      const error = new Error(
        'Simulated stale issue read',
      ) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return super.readText(path);
  }
}

type TestRepositoryItem = {
  id: string;
  value: string;
};

class TestRepository extends StandardRepository<TestRepositoryItem> {
  protected override parseItem(json: unknown): TestRepositoryItem {
    const item = json as Partial<TestRepositoryItem>;
    if (typeof item.id !== 'string' || typeof item.value !== 'string') {
      throw new Error('Invalid test item');
    }
    return {
      id: item.id,
      value: item.value,
    };
  }
}

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
        landmark: 36,
        line: 2,
        operator: 2,
        service: 4,
        station: 17,
        town: 14,
      },
    });

    const manifest = await buildManifest(
      fixtureDataDir,
      '2026-01-01T00:00:00Z',
    );
    expect(manifest.lines).toMatchObject({
      TGL: 'line/TGL.json',
    });
    expect(renderPagesIndex(manifest)).toContain('mrtdown-data');
    expect(renderPagesIndex(manifest)).not.toContain('archive.tar.gz');
    expect(renderPagesIndex(manifest, { includeArchiveLinks: true })).toContain(
      'archive.tar.gz',
    );
  });

  it('rejects fixture line references that are missing from fixture lines', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await mkdir(join(dataDir, 'service'), { recursive: true });
    await mkdir(join(dataDir, 'station'), { recursive: true });
    await writeFile(
      join(dataDir, 'service/NSL_TEST.json'),
      `${JSON.stringify({
        id: 'NSL_TEST',
        name: {
          'en-SG': 'North South Line Test Service',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        lineId: 'NSL',
        revisions: [],
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'station/TEST.json'),
      `${JSON.stringify({
        id: 'TEST',
        name: {
          'en-SG': 'Test Station',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        geo: {
          latitude: 1.3,
          longitude: 103.8,
        },
        stationCodes: [
          {
            lineId: 'NSL',
            code: 'NS0',
            startedAt: '2026-01-01T00:00:00Z',
            endedAt: null,
            structureType: 'underground',
          },
        ],
        landmarkIds: [],
        townId: 'test-town',
      })}\n`,
    );

    const result = await validateDataRoot(dataDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'service/NSL_TEST.json: lineId NSL does not exist in line/',
        'station/TEST.json: stationCodes.0.lineId NSL does not exist in line/',
        'station/TEST.json: townId test-town does not exist in town/',
      ]),
    );
  });

  it('rejects dangling static and issue relationships', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await mkdir(join(dataDir, 'line'), { recursive: true });
    await mkdir(join(dataDir, 'station'), { recursive: true });
    await mkdir(join(dataDir, 'issue/2026/01/2026-01-01-test-issue'), {
      recursive: true,
    });
    await writeFile(
      join(dataDir, 'line/NSL.json'),
      `${JSON.stringify({
        id: 'NSL',
        name: {
          'en-SG': 'North South Line',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        type: 'mrt.high',
        color: '#d42e12',
        startedAt: '1987-11-07',
        serviceIds: ['NSL_MAIN'],
        operators: [
          {
            operatorId: 'SMRT_TRAINS',
            startedAt: '1987-11-07',
            endedAt: null,
          },
        ],
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'station/TEST.json'),
      `${JSON.stringify({
        id: 'TEST',
        name: {
          'en-SG': 'Test Station',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        geo: {
          latitude: 1.3,
          longitude: 103.8,
        },
        stationCodes: [
          {
            lineId: 'NSL',
            code: 'NS0',
            startedAt: '2026-01-01T00:00:00Z',
            endedAt: null,
            structureType: 'underground',
          },
        ],
        landmarkIds: ['test-landmark'],
        townId: 'test-town',
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'issue/2026/01/2026-01-01-test-issue/issue.json'),
      `${JSON.stringify({
        id: '2026-01-01-test-issue',
        type: 'disruption',
        title: {
          'en-SG': 'Test Issue',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        titleMeta: {
          source: 'test',
        },
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'issue/2026/01/2026-01-01-test-issue/evidence.ndjson'),
      `${JSON.stringify({
        id: 'ev_1',
        ts: '2026-01-01T07:00:00+08:00',
        type: 'statement.official',
        sourceUrl: 'https://example.com',
        text: 'Test issue',
        render: null,
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'issue/2026/01/2026-01-01-test-issue/impact.ndjson'),
      `${JSON.stringify({
        id: 'ie_1',
        type: 'service_scopes.set',
        entity: {
          type: 'service',
          serviceId: 'NSL_MAIN',
        },
        ts: '2026-01-01T07:00:00+08:00',
        serviceScopes: [
          {
            type: 'service.point',
            stationId: 'MISSING',
          },
        ],
        basis: {
          evidenceId: 'ev_missing',
        },
      })}\n`,
    );

    const result = await validateDataRoot(dataDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'line/NSL.json: operators.0.operatorId SMRT_TRAINS does not exist in operator/',
        'line/NSL.json: serviceIds.0 NSL_MAIN does not exist in service/',
        'station/TEST.json: townId test-town does not exist in town/',
        'station/TEST.json: landmarkIds.0 test-landmark does not exist in landmark/',
        'issue/2026/01/2026-01-01-test-issue/impact.ndjson:1: basis.evidenceId ev_missing does not exist in evidence.ndjson',
        'issue/2026/01/2026-01-01-test-issue/impact.ndjson:1: entity.serviceId NSL_MAIN does not exist in service/',
        'issue/2026/01/2026-01-01-test-issue/impact.ndjson:1: serviceScopes.0.stationId MISSING does not exist in station/',
      ]),
    );
  });

  it('rejects duplicate issue row ids across issue folders', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const issueIds = [
      '2026-01-01-first-test-issue',
      '2026-01-02-second-test-issue',
    ];

    for (const issueId of issueIds) {
      const issueDir = join(
        dataDir,
        'issue',
        '2026',
        issueId.slice(5, 7),
        issueId,
      );
      await mkdir(issueDir, { recursive: true });
      await writeFile(
        join(issueDir, 'issue.json'),
        `${JSON.stringify({
          id: issueId,
          type: 'disruption',
          title: {
            'en-SG': 'Test Issue',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          titleMeta: {
            source: 'test',
          },
        })}\n`,
      );
      await writeFile(
        join(issueDir, 'evidence.ndjson'),
        `${JSON.stringify({
          id: 'ev_duplicate',
          ts: '2026-01-01T07:00:00+08:00',
          type: 'statement.official',
          sourceUrl: 'https://example.com',
          text: 'Test issue',
          render: null,
        })}\n`,
      );
      await writeFile(
        join(issueDir, 'impact.ndjson'),
        `${JSON.stringify({
          id: 'ie_duplicate',
          type: 'service_effects.set',
          entity: {
            type: 'service',
            serviceId: 'TEST_SERVICE',
          },
          ts: '2026-01-01T07:00:00+08:00',
          effect: {
            kind: 'delay',
            duration: null,
          },
          basis: {
            evidenceId: 'ev_duplicate',
          },
        })}\n`,
      );
    }

    const result = await validateDataRoot(dataDir, ['issue']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'issue/2026/01/2026-01-01-first-test-issue/evidence.ndjson:1: evidence id ev_duplicate is not an ev_<ULID>',
        'issue/2026/01/2026-01-01-first-test-issue/impact.ndjson:1: entity.serviceId TEST_SERVICE does not exist in service/',
        'issue/2026/01/2026-01-02-second-test-issue/evidence.ndjson:1: evidence id ev_duplicate is duplicated (first seen at issue/2026/01/2026-01-01-first-test-issue/evidence.ndjson:1)',
        'issue/2026/01/2026-01-02-second-test-issue/impact.ndjson:1: impact event id ie_duplicate is duplicated (first seen at issue/2026/01/2026-01-01-first-test-issue/impact.ndjson:1)',
      ]),
    );
  });

  it('treats a missing issue root as an empty repository', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const repo = new MRTDownRepository({ store: new FileStore(dataDir) });

    expect(repo.issues.listIds()).toEqual([]);
    expect(repo.issues.list()).toEqual([]);
    expect(repo.issues.get('2026-01-01-missing')).toBeNull();
    expect(repo.issues.searchByQuery('missing')).toEqual([]);
  });

  it('reports malformed issue directories clearly while building manifests', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await mkdir(join(dataDir, 'issue', '2026', '05', 'foo'), {
      recursive: true,
    });

    await expect(buildManifest(dataDir)).rejects.toThrow(
      'Invalid issue id: foo (expected format: YYYY-MM-DD-<slug>',
    );
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

  it('rejects issue ids with impossible calendar dates', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });

    expect(() => buildIssueId('2026-99-99', 'Invalid Signal Fault')).toThrow(
      'Issue id date must be a real calendar date',
    );

    await expect(
      createIssueBundle(dataDir, {
        id: '2026-99-99-invalid-signal-fault',
        title: 'Invalid Signal Fault',
      }),
    ).rejects.toThrow('Issue id date must be a real calendar date');
    expect(() =>
      writer.issues.create({
        id: '2026-99-99-invalid-signal-fault',
        type: 'disruption',
        title: {
          'en-SG': 'Invalid Signal Fault',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        titleMeta: {
          source: 'test',
        },
      }),
    ).toThrow('Invalid issue ID: 2026-99-99-invalid-signal-fault');
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

  it('rejects entity ids that cannot be used as safe filenames', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const station = JSON.parse(
      await readFile(join(fixtureDataDir, 'station/GSW.json'), 'utf8'),
    ) as Record<string, unknown>;

    await expect(
      writeUnknownEntity(dataDir, 'station', {
        ...station,
        id: '../escaped',
      }),
    ).rejects.toThrow('Invalid entity id: ../escaped');
  });

  it('rejects standard writer ids that cannot be used as safe filenames', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new StandardWriter<{ id: string }>(
      new FileWriteStore(dataDir),
      'station',
    );

    expect(() => writer.create({ id: '../escaped' })).toThrow(
      'Invalid item id: ../escaped',
    );
  });

  it('rejects issue writer ids that cannot be used as safe directory names', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });

    expect(() =>
      writer.issues.create({
        id: '2025-01-15-../../etc',
        type: 'disruption',
        title: {
          'en-SG': 'Bad ID',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        titleMeta: {
          source: 'test',
        },
      }),
    ).toThrow('Invalid issue ID: 2025-01-15-../../etc');
  });

  it('rejects duplicate ids while loading standard repositories', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await mkdir(join(dataDir, 'items'), { recursive: true });
    await writeFile(
      join(dataDir, 'items', 'one.json'),
      JSON.stringify({ id: 'duplicate', value: 'first' }),
    );
    await writeFile(
      join(dataDir, 'items', 'two.json'),
      JSON.stringify({ id: 'duplicate', value: 'second' }),
    );

    const repo = new TestRepository(new FileStore(dataDir), 'items');

    expect(() => repo.list()).toThrow(
      "Duplicate id 'duplicate' while loading items/two.json",
    );
  });

  it('does not clobber existing issue files on create', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });
    const issue = {
      id: '2025-01-15-test-issue',
      type: 'disruption' as const,
      title: {
        'en-SG': 'Test issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    };

    writer.issues.create(issue);
    writer.issues.appendEvidence(issue.id, {
      id: 'ev_1',
      ts: '2025-01-15T10:00:00+08:00',
      type: 'report.public',
      sourceUrl: 'https://example.com',
      text: 'Test evidence',
      render: null,
    });

    expect(() => writer.issues.create(issue)).toThrow(
      'Issue already exists: 2025-01-15-test-issue',
    );
    await expect(
      readFile(
        join(dataDir, 'issue/2025/01/2025-01-15-test-issue/evidence.ndjson'),
        'utf8',
      ),
    ).resolves.toContain('ev_1');
  });

  it('claims issue directories before initializing files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const issueId = '2025-01-15-test-issue';
    const issue = {
      id: issueId,
      type: 'disruption' as const,
      title: {
        'en-SG': 'Test issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    };

    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });
    writer.issues.create(issue);
    writer.issues.appendEvidence(issueId, {
      id: 'ev_1',
      ts: '2025-01-15T10:00:00+08:00',
      type: 'report.public',
      sourceUrl: 'https://example.com',
      text: 'Test evidence',
      render: null,
    });

    const racingWriter = new MRTDownWriter({
      store: new StaleIssueJsonReadStore(dataDir),
    });
    expect(() => racingWriter.issues.create(issue)).toThrow(
      'Issue already exists: 2025-01-15-test-issue',
    );
    await expect(
      readFile(
        join(dataDir, 'issue/2025/01/2025-01-15-test-issue/evidence.ndjson'),
        'utf8',
      ),
    ).resolves.toContain('ev_1');
  });

  it('rejects appends for missing issues without creating orphan folders', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });

    expect(() =>
      writer.issues.appendEvidence('2025-01-15-missing-issue', {
        id: 'ev_1',
        ts: '2025-01-15T10:00:00+08:00',
        type: 'report.public',
        sourceUrl: 'https://example.com',
        text: 'Test evidence',
        render: null,
      }),
    ).toThrow('Issue does not exist: 2025-01-15-missing-issue');
    await expect(access(join(dataDir, 'issue'))).rejects.toThrow();
  });

  it('rolls back issue evidence and impact batch appends on failure', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({
      store: new FailingSecondImpactStore(dataDir),
    });
    const issueId = '2025-01-15-test-issue';
    writer.issues.create({
      id: issueId,
      type: 'disruption',
      title: {
        'en-SG': 'Test issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    });

    expect(() =>
      writer.issues.appendEvidenceAndImpacts(
        issueId,
        {
          id: 'ev_1',
          ts: '2025-01-15T10:00:00+08:00',
          type: 'report.public',
          sourceUrl: 'https://example.com',
          text: 'Test evidence',
          render: null,
        },
        [
          {
            id: 'ie_1',
            type: 'causes.set',
            entity: { type: 'service', serviceId: 'NSL' },
            ts: '2025-01-15T10:00:00+08:00',
            causes: ['signal.fault'],
            basis: { evidenceId: 'ev_1' },
          },
          {
            id: 'ie_2',
            type: 'causes.set',
            entity: { type: 'service', serviceId: 'NSL' },
            ts: '2025-01-15T10:01:00+08:00',
            causes: ['track.fault'],
            basis: { evidenceId: 'ev_1' },
          },
        ],
      ),
    ).toThrow('Simulated impact write failure');

    await expect(
      readFile(
        join(dataDir, 'issue/2025/01/2025-01-15-test-issue/evidence.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
    await expect(
      readFile(
        join(dataDir, 'issue/2025/01/2025-01-15-test-issue/impact.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('attempts all rollback steps and reports incomplete rollback', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const store = new FailingRollbackStore(dataDir);
    const writer = new MRTDownWriter({ store });
    const issueId = '2025-01-15-test-issue';
    writer.issues.create({
      id: issueId,
      type: 'disruption',
      title: {
        'en-SG': 'Test issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    });

    expect(() =>
      writer.issues.appendEvidenceAndImpacts(
        issueId,
        {
          id: 'ev_1',
          ts: '2025-01-15T10:00:00+08:00',
          type: 'report.public',
          sourceUrl: 'https://example.com',
          text: 'Test evidence',
          render: null,
        },
        [
          {
            id: 'ie_1',
            type: 'causes.set',
            entity: { type: 'service', serviceId: 'NSL' },
            ts: '2025-01-15T10:00:00+08:00',
            causes: ['signal.fault'],
            basis: { evidenceId: 'ev_1' },
          },
          {
            id: 'ie_2',
            type: 'causes.set',
            entity: { type: 'service', serviceId: 'NSL' },
            ts: '2025-01-15T10:01:00+08:00',
            causes: ['track.fault'],
            basis: { evidenceId: 'ev_1' },
          },
        ],
      ),
    ).toThrow('appendEvidenceAndImpacts failed and rollback was incomplete');
    expect(store.impactRestoreAttempted).toBe(true);
  });

  it('does not treat read failures as missing rollback snapshots', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new MRTDownWriter({
      store: new FailingReadStore(dataDir),
    });
    const issueId = '2025-01-15-test-issue';
    writer.issues.create({
      id: issueId,
      type: 'disruption',
      title: {
        'en-SG': 'Test issue',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      titleMeta: {
        source: 'test',
      },
    });

    expect(() =>
      writer.issues.appendEvidenceAndImpacts(
        issueId,
        {
          id: 'ev_1',
          ts: '2025-01-15T10:00:00+08:00',
          type: 'report.public',
          sourceUrl: 'https://example.com',
          text: 'Test evidence',
          render: null,
        },
        [],
      ),
    ).toThrow('Simulated read failure');

    await expect(
      readFile(
        join(dataDir, 'issue/2025/01/2025-01-15-test-issue/evidence.ndjson'),
        'utf8',
      ),
    ).resolves.toBe('');
  });

  it('rejects invalid timestamps when generating IDs', () => {
    const invalidTimestamp = DateTime.fromISO('not-a-date');

    expect(() => IdGenerator.evidenceId(invalidTimestamp)).toThrow(
      'Invalid timestamp for generated ID',
    );
    expect(() => IdGenerator.impactEventId(invalidTimestamp)).toThrow(
      'Invalid timestamp for generated ID',
    );
  });

  it('deletes directories recursively in the write store', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const store = new FileWriteStore(dataDir);

    store.ensureDir('issue/test/nested');
    store.writeText('issue/test/nested/file.txt', 'ok');
    store.delete('issue/test');

    await expect(access(join(dataDir, 'issue/test'))).rejects.toThrow();
    expect(() => store.delete('issue/test')).not.toThrow();
  });

  it('adds path context to JSON parse failures', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await writeFile(join(dataDir, 'bad.json'), '{');
    const store = new FileStore(dataDir);

    expect(() => store.readJson('bad.json')).toThrow(
      'Invalid JSON in bad.json:',
    );
  });

  it('rejects file store paths that escape the data root', async () => {
    const parentDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-parent-'));
    const dataDir = join(parentDir, 'data');
    await mkdir(dataDir);
    await writeFile(join(parentDir, 'outside.txt'), 'outside');
    await writeFile(join(dataDir, '..inside.txt'), 'inside');
    const store = new FileStore(dataDir);

    expect(store.readText('..inside.txt')).toBe('inside');
    expect(() => store.readText('../outside.txt')).toThrow(
      'Path escapes store root: ../outside.txt',
    );
    expect(() => store.listDir('..')).toThrow('Path escapes store root: ..');
    expect(() => store.exists('../outside.txt')).toThrow(
      'Path escapes store root: ../outside.txt',
    );
  });

  it('returns sorted visible directory entries', () => {
    expect(
      visibleDirEntries(['station.json', '.DS_Store', 'line.json', 'issue']),
    ).toEqual(['issue', 'line.json', 'station.json']);
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

  it('rejects issue folders with mismatched issue ids', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const issueDir = join(
      dataDir,
      'issue',
      '2026',
      '02',
      '2026-02-07-tgl-maintenance',
    );
    await mkdir(issueDir, { recursive: true });
    await writeFile(
      join(issueDir, 'issue.json'),
      `${JSON.stringify({
        id: '2026-02-01-tgl-maintenance',
        type: 'maintenance',
        title: {
          'en-SG': 'Tengah Line Maintenance',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        titleMeta: {
          source: 'test',
        },
      })}\n`,
    );
    await writeFile(join(issueDir, 'evidence.ndjson'), '');
    await writeFile(join(issueDir, 'impact.ndjson'), '');

    await expect(
      readIssueBundle(dataDir, '2026-02-07-tgl-maintenance'),
    ).rejects.toThrow(
      'Issue id mismatch: folder 2026-02-07-tgl-maintenance contains 2026-02-01-tgl-maintenance',
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
