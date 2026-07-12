import { readFileSync } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
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
  generateSchematicMapPublishedArtifacts,
  generateSchematicMapVersionSnapshot,
  IdGenerator,
  issuePathFromId,
  listEntityIds,
  listIssueBundles,
  listSchematicMapConstraintSetEffectiveDates,
  listSchematicMapVersionSnapshotEffectiveDates,
  MRTDownRepository,
  MRTDownWriter,
  nonPublicEvidenceRedactedText,
  readIssueBundle,
  readNdjsonFile,
  readSchematicMapManifest,
  readSchematicMapRuleSet,
  readSchematicMapVersionSnapshot,
  redactNonPublicEvidenceForExport,
  renderPagesIndex,
  StandardRepository,
  schematicSystemMapConstraintSetPath,
  schematicSystemMapManifestPath,
  schematicSystemMapRuleSetPath,
  schematicSystemMapVersionSnapshotPath,
  toDataPath,
  validateDataRoot,
  visibleDirEntries,
  writeNdjsonFile,
  writeSchematicMapConstraintSet,
  writeSchematicMapManifest,
  writeSchematicMapRuleSet,
  writeSchematicMapVersionSnapshot,
  writeUnknownEntity,
} from './index.js';
import { StandardWriter } from './write/common/StandardWriter.js';

const fixtureDataDir = resolve(
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../fixtures/generated/data',
    ),
);
const fixtureMeta = JSON.parse(
  readFileSync(
    process.env.MRTDOWN_FIXTURE_META_PATH ??
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../fixtures/generated/meta.json',
      ),
    'utf8',
  ),
) as {
  counts: Record<string, number>;
  issueOrder: string[];
  issues: {
    trainFault: {
      id: string;
      title: string;
      serviceIds: string[];
    };
  };
};

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
      'ISL',
      'TKL',
      'TWL',
    ]);

    const bundle = await readIssueBundle(
      fixtureDataDir,
      fixtureMeta.issues.trainFault.id,
    );

    expect(bundle.issue.title['en-SG']).toBe(
      fixtureMeta.issues.trainFault.title,
    );
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.impactEvents).toHaveLength(8);
  });

  it('validates fixtures and builds a manifest', async () => {
    const result = await validateDataRoot(fixtureDataDir);
    expect(result).toMatchObject({
      ok: true,
      checked: fixtureMeta.counts,
    });

    const manifest = await buildManifest(
      fixtureDataDir,
      '2026-01-01T00:00:00Z',
    );
    expect(manifest.manifestVersion).toBe(2);
    expect(manifest.lines.ISL).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.rights.licenseData).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.rights.sourceRegistry).toMatch(/^[0-9a-f]{64}$/);
    const pagesIndex = renderPagesIndex(manifest);
    expect(pagesIndex).toContain('mrtdown-data');
    expect(pagesIndex).toContain('href="#lines"');
    expect(pagesIndex).toContain('<h2 id="exports">Exports</h2>');
    expect(pagesIndex).toContain('LICENSE-DATA.md');
    expect(pagesIndex).not.toContain('archive.tar.gz');
    expect(renderPagesIndex(manifest, { includeArchiveLinks: true })).toContain(
      'archive.tar.gz',
    );
    expect(
      renderPagesIndex(manifest, { includeFixtureExportLinks: true }),
    ).toContain('fixtures/');
  });

  it('validates the source registry through the data root validator', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    await writeFile(
      join(dataDir, 'rights/source-registry.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        rights: [
          {
            id: 'CC-BY-4.0',
            label: 'Creative Commons Attribution 4.0 International',
            url: 'https://creativecommons.org/licenses/by/4.0/',
            category: 'mrtdown-authored',
            summary: 'MRTDown-authored reusable data.',
          },
        ],
        rules: [
          {
            id: 'broken',
            label: 'Broken rule',
            match: { sourceUrlHost: ['example.com'] },
            category: 'generic-web',
            contentRights: 'LicenseRef-Missing',
            mrtdownRights: 'CC-BY-4.0',
            policy: 'third-party-content-not-licensed-by-mrtdown',
            attributionTemplate: '{sourceUrl}',
            publicExportAllowed: true,
          },
        ],
      })}\n`,
    );

    const result = await validateDataRoot(dataDir, ['rights']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'rights: rules.0.contentRights: Unknown rights id LicenseRef-Missing',
    ]);
  });

  it('requires issue evidence to resolve to a source registry rule', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const [bundle] = await listIssueBundles(dataDir);
    expect(bundle).toBeDefined();
    const evidencePath = join(dataDir, bundle.path, 'evidence.ndjson');
    const [evidence, ...remainingEvidence] = bundle.evidence;
    expect(evidence).toBeDefined();
    await writeNdjsonFile(evidencePath, [
      EvidenceSchema.parse({
        ...evidence,
        sourceUrl: 'https://unregistered.example.net/source/1',
      }),
      ...remainingEvidence,
    ]);

    const result = await validateDataRoot(dataDir, ['issue', 'rights']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      `${bundle.path}/evidence.ndjson:1: evidence source rights no-match for https://unregistered.example.net/source/1`,
    ]);
  });

  it('redacts non-exportable source evidence from public exports', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const [bundle] = await listIssueBundles(dataDir);
    expect(bundle).toBeDefined();
    const evidencePath = join(dataDir, bundle.path, 'evidence.ndjson');
    const [evidence, ...remainingEvidence] = bundle.evidence;
    expect(evidence).toBeDefined();
    const nonPublicEvidence = EvidenceSchema.parse({
      ...evidence,
      type: 'report.public',
      sourceUrl:
        'https://reports.mrtdown.sg/crowd-reports/accepted-20260523-0903-dtl-001',
    });
    await writeNdjsonFile(evidencePath, [
      nonPublicEvidence,
      ...remainingEvidence,
    ]);

    await expect(
      validateDataRoot(dataDir, ['issue', 'rights']),
    ).resolves.toMatchObject({ ok: true });

    await expect(redactNonPublicEvidenceForExport(dataDir)).resolves.toEqual({
      redactedEvidenceCount: 1,
    });
    await expect(readNdjsonFile(evidencePath, EvidenceSchema)).resolves.toEqual(
      [
        {
          ...nonPublicEvidence,
          text: nonPublicEvidenceRedactedText,
          render: null,
        },
        ...remainingEvidence,
      ],
    );
    await expect(
      validateDataRoot(dataDir, ['issue', 'rights']),
    ).resolves.toMatchObject({ ok: true });
  });

  it('redacts evidence with inconclusive source rights from public exports', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const [bundle] = await listIssueBundles(dataDir);
    expect(bundle).toBeDefined();
    const evidencePath = join(dataDir, bundle.path, 'evidence.ndjson');
    const [evidence, ...remainingEvidence] = bundle.evidence;
    expect(evidence).toBeDefined();
    const unresolvedEvidence = EvidenceSchema.parse({
      ...evidence,
      sourceUrl: 'https://unregistered.example.net/source/1',
    });
    await writeNdjsonFile(evidencePath, [
      unresolvedEvidence,
      ...remainingEvidence,
    ]);

    await expect(redactNonPublicEvidenceForExport(dataDir)).resolves.toEqual({
      redactedEvidenceCount: 1,
    });
    await expect(readNdjsonFile(evidencePath, EvidenceSchema)).resolves.toEqual(
      [
        {
          ...unresolvedEvidence,
          text: nonPublicEvidenceRedactedText,
          render: null,
        },
        ...remainingEvidence,
      ],
    );
  });

  it('reads and writes schematic map generator files and generated snapshots', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const ruleSet = {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['NSL', 'EWL', 'CCL'],
    } as const;
    const constraintSet = {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2025_04',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 3140, height: 2400 },
        },
        {
          id: 'anchor_amk',
          type: 'station_anchor',
          stationId: 'AMK',
          point: { x: 1170, y: 550 },
        },
      ],
    } as const;
    const snapshot = {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_NSL',
          lineId: 'NSL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_amk:bsh'],
        },
      ],
      segments: [
        {
          id: 'line_amk:bsh',
          lineId: 'NSL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'AMK',
            toStationId: 'BSH',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 1170, y: 550 },
              { x: 1250, y: 630 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'trunk-octilinear',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_amk',
          stationId: 'AMK',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 1170, y: 550 },
          lineIds: ['NSL'],
          parts: [
            {
              id: 'node_amk_nsl',
              lineId: 'NSL',
              shape: {
                type: 'circle',
                center: { x: 1170, y: 550 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_amk',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'anchor_amk',
          },
        },
        {
          id: 'node_bsh',
          stationId: 'BSH',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 1250, y: 630 },
          lineIds: ['NSL'],
          parts: [
            {
              id: 'node_bsh_nsl',
              lineId: 'NSL',
              shape: {
                type: 'circle',
                center: { x: 1250, y: 630 },
                radius: 11,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_bsh',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'anchor_bsh',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    } as const;
    const manifest = {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    } as const;

    await expect(
      listSchematicMapConstraintSetEffectiveDates(dataDir),
    ).resolves.toEqual([]);
    await expect(
      listSchematicMapVersionSnapshotEffectiveDates(dataDir),
    ).resolves.toEqual([]);

    const writer = new MRTDownWriter({ store: new FileWriteStore(dataDir) });
    writer.schematicMaps.writeRuleSet(ruleSet);
    await expect(
      writeSchematicMapConstraintSet(dataDir, constraintSet),
    ).resolves.toBe(schematicSystemMapConstraintSetPath('2025-04'));
    await expect(
      writeSchematicMapVersionSnapshot(dataDir, snapshot),
    ).resolves.toBe(schematicSystemMapVersionSnapshotPath('2025-04'));
    await expect(writeSchematicMapManifest(dataDir, manifest)).resolves.toBe(
      schematicSystemMapManifestPath(),
    );

    const repo = new MRTDownRepository({ store: new FileStore(dataDir) });
    expect(repo.schematicMaps.getRuleSet()?.lineOrder).toEqual([
      'NSL',
      'EWL',
      'CCL',
    ]);
    expect(repo.schematicMaps.listConstraintSetEffectiveDates()).toEqual([
      '2025-04',
    ]);
    expect(
      repo.schematicMaps.getConstraintSet('2025-04')?.constraints,
    ).toHaveLength(2);
    expect(repo.schematicMaps.listVersionSnapshotEffectiveDates()).toEqual([
      '2025-04',
    ]);
    expect(
      repo.schematicMaps.getVersionSnapshot('2025-04')?.segments,
    ).toHaveLength(1);

    await expect(readSchematicMapRuleSet(dataDir)).resolves.toMatchObject({
      path: schematicSystemMapRuleSetPath('lta-system-map-2011'),
      value: { lineOrder: ['NSL', 'EWL', 'CCL'] },
    });
    await expect(readSchematicMapManifest(dataDir)).resolves.toMatchObject({
      path: schematicSystemMapManifestPath(),
      value: manifest,
    });
    await expect(
      readSchematicMapVersionSnapshot(dataDir, '2025-04'),
    ).resolves.toMatchObject({
      path: schematicSystemMapVersionSnapshotPath('2025-04'),
      value: { effectiveDate: '2025-04' },
    });
  });

  it('generates a deterministic schematic map snapshot from active services', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL', 'TKL', 'TWL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2026-05',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2026_05',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 1200, height: 600 },
        },
        {
          id: 'anchor_ket',
          type: 'station_anchor',
          stationId: 'KET',
          point: { x: 100, y: 100 },
        },
        {
          id: 'label_ket',
          type: 'label_hint',
          stationId: 'KET',
          side: 'left',
          offset: { x: -30, y: 0 },
        },
      ],
    });

    const snapshot = await generateSchematicMapVersionSnapshot(dataDir, {
      effectiveDate: '2026-05',
      generatedAt: '2026-05-27T00:00:00.000Z',
    });

    expect(snapshot.lineGroups.map((lineGroup) => lineGroup.lineId)).toEqual([
      'ISL',
      'TKL',
      'TWL',
    ]);
    expect(snapshot.lineGroups.map((lineGroup) => lineGroup.id)).toEqual([
      'line_isl',
      'line_tkl',
      'line_twl',
    ]);
    expect(snapshot.segments).toContainEqual(
      expect.objectContaining({
        id: 'line_hku:ket',
        lineId: 'ISL',
        topology: {
          type: 'station_pair',
          fromStationId: 'KET',
          toStationId: 'HKU',
        },
      }),
    );
    expect(
      snapshot.stationNodes.find((node) => node.stationId === 'KET'),
    ).toMatchObject({
      center: { x: 100, y: 100 },
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'anchor_ket',
      },
    });
    expect(
      snapshot.labels.find((label) => label.stationId === 'KET'),
    ).toMatchObject({
      anchor: { x: 70, y: 100 },
      coordinateMetadata: {
        coordinateClass: 'constraint',
        constraintId: 'label_ket',
      },
    });

    await writeSchematicMapVersionSnapshot(dataDir, snapshot);
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2026-05',
          path: 'version/2026-05.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });
    await expect(
      validateDataRoot(dataDir, ['schematic-map']),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('generates published schematic map artifacts from constraint versions', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL', 'TKL', 'TWL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2026-05',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2026_05',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 1200, height: 600 },
        },
      ],
    });

    await expect(
      generateSchematicMapPublishedArtifacts(dataDir, {
        generatedAt: '2026-05-27T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      manifest: 'schematic-map/system/manifest.json',
      snapshots: ['schematic-map/system/version/2026-05.json'],
    });
    await expect(readSchematicMapManifest(dataDir)).resolves.toMatchObject({
      value: {
        versions: [
          {
            effectiveDate: '2026-05',
            path: 'version/2026-05.json',
            layoutEngineId: 'lta-system-map-2011',
          },
        ],
      },
    });
    await expect(
      readSchematicMapVersionSnapshot(dataDir, '2026-05'),
    ).resolves.toMatchObject({
      value: {
        effectiveDate: '2026-05',
        generatedAt: '2026-05-27T00:00:00.000Z',
      },
    });
    await expect(
      validateDataRoot(dataDir, ['schematic-map']),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('uses Singapore month boundaries when selecting active schematic services', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });

    const snapshot = await generateSchematicMapVersionSnapshot(dataDir, {
      effectiveDate: '1979-09',
      generatedAt: '2026-05-27T00:00:00.000Z',
    });

    expect(snapshot.lineGroups).toEqual([]);
    expect(snapshot.stationNodes).toEqual([]);
  });

  it('derives line station order from line topology instead of service file order', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeFile(
      join(dataDir, 'service/AAA_BRANCH.json'),
      `${JSON.stringify(
        {
          id: 'AAA_BRANCH',
          name: {
            'en-SG': 'Fixture branch',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          lineId: 'ISL',
          revisions: [
            {
              id: 'r_initial',
              startAt: '1979-10-01',
              endAt: null,
              path: {
                stations: [
                  { stationId: 'ADM', displayCode: 'ISL6' },
                  { stationId: 'TST', displayCode: '' },
                ],
              },
              operatingHours: {
                weekdays: { start: '05:30', end: '00:30' },
                weekends: { start: '05:30', end: '00:30' },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const snapshot = await generateSchematicMapVersionSnapshot(dataDir, {
      effectiveDate: '2026-05',
      generatedAt: '2026-05-27T00:00:00.000Z',
    });

    const stationX = new Map(
      snapshot.stationNodes.map((node) => [node.stationId, node.center.x]),
    );
    expect(stationX.get('KET')).toBe(80);
    expect(stationX.get('ADM')).toBeGreaterThan(stationX.get('KET') ?? 0);
    expect(stationX.get('TST')).toBeGreaterThan(stationX.get('ADM') ?? 0);
  });

  it('rejects schematic map references that are missing from canonical data', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'missing_station_anchor',
          type: 'station_anchor',
          stationId: 'NOPE',
          point: { x: 100, y: 100 },
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/constraint/2025-04.json: constraints.0.stationId NOPE does not exist in station/',
    );
  });

  it('validates every schematic map rule set file', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const ruleSetPath = join(
      dataDir,
      'schematic-map/system/generator/engine/extra.json',
    );
    await mkdir(dirname(ruleSetPath), { recursive: true });
    await writeFile(
      ruleSetPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mapId: 'system',
          layoutEngineId: 'lta-system-map-2011',
          lineOrder: ['ISL', 'NOPE'],
        },
        null,
        2,
      )}\n`,
    );

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/engine/extra.json: layoutEngineId lta-system-map-2011 does not match schematic-map/system/generator/engine/lta-system-map-2011.json',
    );
    expect(result.errors).toContain(
      'schematic-map/system/generator/engine/extra.json: lineOrder.1 NOPE does not exist in line/',
    );
  });

  it('rejects schematic map constraint files with mismatched effective dates', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const constraintPath = join(
      dataDir,
      schematicSystemMapConstraintSetPath('2025-04'),
    );
    await mkdir(dirname(constraintPath), { recursive: true });
    await writeFile(
      constraintPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mapId: 'system',
          effectiveDate: '2025-05',
          layoutEngineId: 'lta-system-map-2011',
          constraints: [],
        },
        null,
        2,
      )}\n`,
    );

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/constraint/2025-04.json: effectiveDate 2025-05 does not match schematic-map/system/generator/constraint/2025-05.json',
    );
  });

  it('rejects schematic map snapshots that satisfy a manifest from the wrong file path', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const snapshotPath = join(
      dataDir,
      schematicSystemMapVersionSnapshotPath('2025-04'),
    );
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(
      snapshotPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          mapId: 'system',
          effectiveDate: '2025-05',
          layoutEngineId: 'lta-system-map-2011',
          generatedAt: '2026-05-27T00:00:00.000Z',
          frame: { x: 0, y: 0, width: 3140, height: 2400 },
          layers: [{ id: 'lines', role: 'line' }],
          lineGroups: [],
          segments: [],
          stationNodes: [],
          labels: [],
          stationCodeLabels: [],
        },
        null,
        2,
      )}\n`,
    );
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-05',
          path: 'version/2025-05.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: effectiveDate 2025-05 does not match schematic-map/system/version/2025-05.json',
    );
    expect(result.errors).toContain(
      'schematic-map/system/manifest.json: versions.0.effectiveDate 2025-05 does not have a generated snapshot',
    );
  });

  it('rejects schematic map manifest paths that are not manifest-relative', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [],
      segments: [],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_ket_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
        {
          id: 'node_hku',
          stationId: 'HKU',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_hku_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_hku',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'schematic-map/system/version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/manifest.json: versions.0.path schematic-map/system/version/2025-04.json does not match version/2025-04.json',
    );
  });

  it('rejects schematic map station nodes on unrelated lines', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [],
      segments: [],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_ket_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [
        {
          id: 'code_ket_twl',
          stationId: 'KET',
          lineId: 'TWL',
          displayStatus: 'operational',
          layerId: 'lines',
          anchor: { x: 100, y: 120 },
          side: 'bottom',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-label',
          },
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: stationNodes.0.lineIds.0 TWL is not a station code line for station KET',
    );
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: stationCodeLabels.0.lineId TWL is not a station code line for station KET',
    );
  });

  it('rejects schematic map interchange hints on unrelated station lines', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'interchange_ket_twl',
          type: 'interchange_hint',
          stationId: 'KET',
          lineIds: ['ISL', 'TWL'],
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/constraint/2025-04.json: constraints.0.lineIds.1 TWL is not a station code line for station KET',
    );
  });

  it('rejects schematic map route hints on unrelated station lines', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['TWL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'route_hint_ket_hku',
          type: 'segment_route_hint',
          lineId: 'TWL',
          fromStationId: 'KET',
          toStationId: 'HKU',
          via: [{ x: 100, y: 100 }],
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/constraint/2025-04.json: constraints.0.fromStationId TWL is not a station code line for station KET',
    );
  });

  it('rejects schematic map station-pair segments on unrelated lines', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_TWL',
          lineId: 'TWL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_ket:hku'],
        },
      ],
      segments: [
        {
          id: 'line_ket:hku',
          lineId: 'TWL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'HKU',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'fixture-line',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_ket_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
        {
          id: 'node_hku',
          stationId: 'HKU',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_hku_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_hku',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: segments.0.topology.fromStationId TWL is not a station code line for station KET',
    );
  });

  it('rejects schematic map station-pair segments without adjacent service edges', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_ISL',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_ket:adm'],
        },
      ],
      segments: [
        {
          id: 'line_ket:adm',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'ADM',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'fixture-line',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_ket_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
        {
          id: 'node_adm',
          stationId: 'ADM',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_adm_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_adm',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: segments.0.topology KET:ADM is not an adjacent service edge for line ISL',
    );
  });

  it('rejects schematic map references without matching layout engine rules', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/generator/constraint/2025-04.json: layoutEngineId lta-system-map-2011 does not have a schematic map rule set',
    );
  });

  it('rejects schematic map station lines outside station code active windows', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const stationPath = join(dataDir, 'station/KET.json');
    const station = JSON.parse(await readFile(stationPath, 'utf8')) as {
      stationCodes: unknown[];
    };
    station.stationCodes.push({
      lineId: 'TWL',
      code: 'TWL99',
      startedAt: '2025-05-01',
      endedAt: null,
      structureType: 'underground',
    });
    await writeFile(stationPath, `${JSON.stringify(station, null, 2)}\n`);
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['TWL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [],
      segments: [],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_ket_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: stationNodes.0.lineIds.0 TWL is not an active station code line for station KET at 2025-04',
    );
  });

  it('allows schematic map active checks within the effective month', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    for (const stationId of ['KET', 'HKU']) {
      const stationPath = join(dataDir, `station/${stationId}.json`);
      const station = JSON.parse(await readFile(stationPath, 'utf8')) as {
        stationCodes: Array<{ lineId: string; startedAt: string }>;
      };
      const islandLineCode = station.stationCodes.find(
        (code) => code.lineId === 'ISL',
      );
      if (!islandLineCode) {
        throw new Error(`Missing fixture ISL code for ${stationId}`);
      }
      islandLineCode.startedAt = '2025-04-30';
      await writeFile(stationPath, `${JSON.stringify(station, null, 2)}\n`);
    }

    const servicePath = join(dataDir, 'service/ISL_MAIN_E.json');
    const service = JSON.parse(await readFile(servicePath, 'utf8')) as {
      revisions: Array<{ startAt: string }>;
    };
    service.revisions[0].startAt = '2025-04-30';
    await writeFile(servicePath, `${JSON.stringify(service, null, 2)}\n`);

    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_ISL',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_ket:hku'],
        },
      ],
      segments: [
        {
          id: 'line_ket:hku',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'HKU',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'fixture-line',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_ket_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'generated',
                ruleId: 'fixture-node',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-node',
          },
        },
        {
          id: 'node_hku',
          stationId: 'HKU',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_hku_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'generated',
                ruleId: 'fixture-node',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-node',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(true);
  });

  it('rejects schematic map station-pair edges from future service revisions', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const servicePath = join(dataDir, 'service/ISL_MAIN_E.json');
    const service = JSON.parse(await readFile(servicePath, 'utf8')) as {
      revisions: Array<{
        id: string;
        startAt: string;
        endAt: string | null;
        path: { stations: Array<{ stationId: string; displayCode: string }> };
        operatingHours: unknown;
      }>;
    };
    service.revisions.push({
      ...service.revisions[0],
      id: 'r_future_direct',
      startAt: '2025-05-01',
      endAt: null,
      path: {
        stations: [
          { stationId: 'KET', displayCode: 'ISL1' },
          { stationId: 'ADM', displayCode: 'ISL6' },
        ],
      },
    });
    await writeFile(servicePath, `${JSON.stringify(service, null, 2)}\n`);
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_ISL',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_ket:adm'],
        },
      ],
      segments: [
        {
          id: 'line_ket:adm',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'ADM',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'fixture-line',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_ket_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
        {
          id: 'node_adm',
          stationId: 'ADM',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_adm_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_adm',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: segments.0.topology KET:ADM is not an adjacent service edge for line ISL',
    );
  });

  it('allows non-operational schematic station coverage before station codes start', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const stationPath = join(dataDir, 'station/KET.json');
    const station = JSON.parse(await readFile(stationPath, 'utf8')) as {
      stationCodes: unknown[];
    };
    station.stationCodes.push({
      lineId: 'TWL',
      code: 'TWL99',
      startedAt: '2025-05-01',
      endedAt: null,
      structureType: 'underground',
    });
    await writeFile(stationPath, `${JSON.stringify(station, null, 2)}\n`);
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['TWL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [],
      segments: [],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'planned',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['TWL'],
          parts: [
            {
              id: 'node_ket_twl',
              lineId: 'TWL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [
        {
          id: 'code_ket_twl',
          stationId: 'KET',
          lineId: 'TWL',
          displayStatus: 'planned',
          layerId: 'lines',
          anchor: { x: 100, y: 120 },
          side: 'bottom',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-label',
          },
        },
      ],
    });
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(true);
  });

  it('allows future-display route constraints before station codes start', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    for (const stationId of ['KET', 'ADM']) {
      const stationPath = join(dataDir, `station/${stationId}.json`);
      const station = JSON.parse(await readFile(stationPath, 'utf8')) as {
        stationCodes: unknown[];
      };
      station.stationCodes.push({
        lineId: 'TWL',
        code: `${stationId}99`,
        startedAt: '2025-05-01',
        endedAt: null,
        structureType: 'underground',
      });
      await writeFile(stationPath, `${JSON.stringify(station, null, 2)}\n`);
    }

    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['TWL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'future_twl_route',
          type: 'segment_route_hint',
          lineId: 'TWL',
          fromStationId: 'KET',
          toStationId: 'ADM',
          via: [{ x: 100, y: 100 }],
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(true);
  });

  it('allows future-display interchange constraints before station codes start', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    const stationPath = join(dataDir, 'station/KET.json');
    const station = JSON.parse(await readFile(stationPath, 'utf8')) as {
      stationCodes: unknown[];
    };
    station.stationCodes.push({
      lineId: 'TWL',
      code: 'TWL99',
      startedAt: '2025-05-01',
      endedAt: null,
      structureType: 'underground',
    });
    await writeFile(stationPath, `${JSON.stringify(station, null, 2)}\n`);

    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL', 'TWL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'future_interchange',
          type: 'interchange_hint',
          stationId: 'KET',
          lineIds: ['ISL', 'TWL'],
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(true);
  });

  it('allows non-operational station-pair segments before service edges open', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [
        {
          id: 'line_ISL',
          lineId: 'ISL',
          displayStatus: 'planned',
          layerId: 'lines',
          segmentIds: ['line_ket:adm'],
        },
      ],
      segments: [
        {
          id: 'line_ket:adm',
          lineId: 'ISL',
          displayStatus: 'planned',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'ADM',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'generated',
              ruleId: 'fixture-line',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_ket_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_ket',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
        {
          id: 'node_adm',
          stationId: 'ADM',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_adm_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'artifact',
                generatedFrom: 'node_adm',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-line',
          },
        },
      ],
      labels: [],
      stationCodeLabels: [],
    });
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(true);
  });

  it('rejects schematic map snapshots omitted from the manifest', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: { x: 0, y: 0, width: 3140, height: 2400 },
      layers: [{ id: 'lines', role: 'line' }],
      lineGroups: [],
      segments: [],
      stationNodes: [],
      labels: [],
      stationCodeLabels: [],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'schematic-map/system/version/2025-04.json: effectiveDate 2025-04 is not listed in schematic map manifest',
    );
  });

  it('rejects schematic map snapshot constraint metadata without matching constraints', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeSchematicMapRuleSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      layoutEngineId: 'lta-system-map-2011',
      lineOrder: ['ISL'],
    });
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'known_anchor',
          type: 'station_anchor',
          stationId: 'KET',
          point: { x: 100, y: 100 },
        },
      ],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-04',
      layoutEngineId: 'lta-system-map-2011',
      generatedAt: '2026-05-27T00:00:00.000Z',
      frame: {
        x: 0,
        y: 0,
        width: 3140,
        height: 2400,
        coordinateMetadata: {
          coordinateClass: 'constraint',
          constraintId: 'missing_frame',
        },
      },
      layers: [
        { id: 'lines', role: 'line' },
        { id: 'labels', role: 'label' },
      ],
      lineGroups: [
        {
          id: 'line_ISL',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          segmentIds: ['line_ket:hku'],
        },
      ],
      segments: [
        {
          id: 'line_ket:hku',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          topology: {
            type: 'station_pair',
            fromStationId: 'KET',
            toStationId: 'HKU',
          },
          geometry: {
            type: 'polyline',
            points: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'constraint',
              constraintId: 'missing_segment',
            },
          },
        },
      ],
      stationNodes: [
        {
          id: 'node_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 100, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_ket_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 100, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'constraint',
                constraintId: 'missing_part',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'missing_node',
          },
        },
        {
          id: 'node_hku',
          stationId: 'HKU',
          displayStatus: 'operational',
          layerId: 'lines',
          center: { x: 200, y: 100 },
          lineIds: ['ISL'],
          parts: [
            {
              id: 'node_hku_isl',
              lineId: 'ISL',
              shape: {
                type: 'circle',
                center: { x: 200, y: 100 },
                radius: 8,
              },
              coordinateMetadata: {
                coordinateClass: 'generated',
                ruleId: 'fixture-node',
              },
            },
          ],
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-node',
          },
        },
      ],
      labels: [
        {
          id: 'label_ket',
          stationId: 'KET',
          displayStatus: 'operational',
          layerId: 'labels',
          anchor: { x: 100, y: 80 },
          side: 'top',
          leaderLine: {
            type: 'polyline',
            points: [
              { x: 100, y: 90 },
              { x: 100, y: 100 },
            ],
            coordinateMetadata: {
              coordinateClass: 'constraint',
              constraintId: 'missing_leader',
            },
          },
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'missing_label',
          },
        },
      ],
      stationCodeLabels: [
        {
          id: 'code_ket_isl',
          stationId: 'KET',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'labels',
          anchor: { x: 100, y: 120 },
          side: 'bottom',
          coordinateMetadata: {
            coordinateClass: 'constraint',
            constraintId: 'missing_code',
          },
        },
      ],
    });
    await writeSchematicMapManifest(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      versions: [
        {
          effectiveDate: '2025-04',
          path: 'version/2025-04.json',
          layoutEngineId: 'lta-system-map-2011',
        },
      ],
    });

    const result = await validateDataRoot(dataDir, ['schematic-map']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'schematic-map/system/version/2025-04.json: frame.coordinateMetadata.constraintId missing_frame does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: segments.0.geometry.coordinateMetadata.constraintId missing_segment does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: stationNodes.0.parts.0.coordinateMetadata.constraintId missing_part does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: stationNodes.0.coordinateMetadata.constraintId missing_node does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: labels.0.leaderLine.coordinateMetadata.constraintId missing_leader does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: labels.0.coordinateMetadata.constraintId missing_label does not exist in schematic map constraints for 2025-04',
        'schematic-map/system/version/2025-04.json: stationCodeLabels.0.coordinateMetadata.constraintId missing_code does not exist in schematic map constraints for 2025-04',
      ]),
    );
  });

  it('includes issue impact events in manifest hashes', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    const issueId = fixtureMeta.issues.trainFault.id;
    const before = await buildManifest(dataDir, '2026-01-01T00:00:00Z');
    const impactPath = join(
      dataDir,
      `issue/${issueId.slice(0, 4)}/${issueId.slice(5, 7)}/${issueId}/impact.ndjson`,
    );
    const impactText = await readFile(impactPath, 'utf8');
    const [firstImpactLine] = impactText.trimEnd().split('\n');
    await writeFile(impactPath, `${impactText}${firstImpactLine}\n`);

    const after = await buildManifest(dataDir, '2026-01-01T00:00:00Z');

    expect(before.issues[issueId]).toMatch(/^[0-9a-f]{64}$/);
    expect(after.issues[issueId]).toMatch(/^[0-9a-f]{64}$/);
    expect(after.issues[issueId]).not.toBe(before.issues[issueId]);
  });

  it('includes source registry content in manifest hashes', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    const before = await buildManifest(dataDir, '2026-01-01T00:00:00Z');
    const sourceRegistryPath = join(dataDir, 'rights/source-registry.json');
    const sourceRegistry = JSON.parse(
      await readFile(sourceRegistryPath, 'utf8'),
    ) as { rules: Array<{ label: string }> };
    sourceRegistry.rules[0].label = `${sourceRegistry.rules[0].label} updated`;
    await writeFile(
      sourceRegistryPath,
      `${JSON.stringify(sourceRegistry, null, 2)}\n`,
    );

    const after = await buildManifest(dataDir, '2026-01-01T00:00:00Z');

    expect(before.rights.sourceRegistry).toMatch(/^[0-9a-f]{64}$/);
    expect(after.rights.sourceRegistry).toMatch(/^[0-9a-f]{64}$/);
    expect(after.rights.sourceRegistry).not.toBe(before.rights.sourceRegistry);
  });

  it('includes data license content in manifest hashes', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });

    const before = await buildManifest(dataDir, '2026-01-01T00:00:00Z');
    await writeFile(
      join(dataDir, 'LICENSE-DATA.md'),
      '# Updated fixture data license\n',
    );

    const after = await buildManifest(dataDir, '2026-01-01T00:00:00Z');

    expect(before.rights.licenseData).toMatch(/^[0-9a-f]{64}$/);
    expect(after.rights.licenseData).toMatch(/^[0-9a-f]{64}$/);
    expect(after.rights.licenseData).not.toBe(before.rights.licenseData);
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
          'en-SG': 'Test Service',
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
            startedAt: '2026-01-01',
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
            startedAt: '2026-01-01',
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
      })}\n${JSON.stringify({
        id: 'ie_2',
        type: 'facility_effects.set',
        entity: {
          type: 'facility',
          stationId: 'TEST',
          lineId: 'MISSING',
          kind: 'screen-door',
        },
        ts: '2026-01-01T07:00:00+08:00',
        effect: {
          kind: 'degraded',
        },
        basis: {
          evidenceId: 'ev_1',
        },
      })}\n${JSON.stringify({
        id: 'ie_3',
        type: 'service_scopes.set',
        entity: {
          type: 'service',
          serviceId: 'NSL_MAIN',
        },
        ts: '2026-01-01T07:00:00+08:00',
        serviceScopes: [
          {
            type: 'service.whole',
          },
        ],
        basis: {
          evidenceId: 'ev_1',
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
        'issue/2026/01/2026-01-01-test-issue/impact.ndjson:2: entity.lineId MISSING does not exist in line/',
        'issue/2026/01/2026-01-01-test-issue/impact.ndjson:3: service_scopes.set for service NSL_MAIN has the same ts as issue/2026/01/2026-01-01-test-issue/impact.ndjson:1; setter events for the same entity and type need distinct timestamps',
      ]),
    );
  });

  it('rejects invalid station first and last train relationships', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeFile(
      join(dataDir, 'station/KET.json'),
      `${JSON.stringify(
        {
          id: 'KET',
          name: {
            'en-SG': 'Kennedy Town',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          geo: {
            latitude: 22.2813,
            longitude: 114.1286,
          },
          stationCodes: [
            {
              lineId: 'ISL',
              code: 'ISL1',
              startedAt: '1979-10-01',
              endedAt: null,
              structureType: 'underground',
            },
          ],
          landmarkIds: [],
          townId: 'central-western',
          firstLastTrain: {
            services: [
              {
                serviceId: 'ISL_MAIN_E',
                times: {
                  weekday: {
                    firstTrain: '06:00',
                    lastTrain: '00:50',
                  },
                },
              },
              {
                serviceId: 'ISL_MAIN_E',
                times: {
                  saturday: {
                    firstTrain: '06:05',
                    lastTrain: null,
                  },
                },
              },
              {
                serviceId: 'MISSING',
                times: {
                  weekday: {
                    firstTrain: null,
                    lastTrain: '00:30',
                  },
                },
              },
              {
                serviceId: 'TWL_MAIN_N',
                times: {
                  weekday: {
                    firstTrain: null,
                    lastTrain: '00:35',
                  },
                },
              },
              {
                serviceId: 'ISL_ENDED',
                times: {
                  weekday: {
                    firstTrain: '06:10',
                    lastTrain: null,
                  },
                },
              },
              {
                serviceId: 'ISL_FUTURE_ENDED',
                times: {
                  daily: {
                    firstTrain: '06:15',
                    lastTrain: null,
                  },
                },
              },
              {
                serviceId: 'ISL_MULTI_CURRENT',
                times: {
                  sunday_public_holiday: {
                    firstTrain: null,
                    lastTrain: '00:45',
                  },
                },
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(dataDir, 'service/ISL_ENDED.json'),
      `${JSON.stringify(
        {
          id: 'ISL_ENDED',
          name: {
            'en-SG': 'Ended Service',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          lineId: 'ISL',
          revisions: [
            {
              id: 'r_initial',
              startAt: '1979-10-01',
              endAt: '1980-01-01',
              path: {
                stations: [
                  {
                    stationId: 'KET',
                    displayCode: 'ISL1',
                  },
                ],
              },
              operatingHours: {
                weekdays: {
                  start: '05:30',
                  end: '00:30',
                },
                weekends: {
                  start: '05:30',
                  end: '00:30',
                },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(dataDir, 'service/ISL_FUTURE_ENDED.json'),
      `${JSON.stringify(
        {
          id: 'ISL_FUTURE_ENDED',
          name: {
            'en-SG': 'Future Ended Service',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          lineId: 'ISL',
          revisions: [
            {
              id: 'r_current',
              startAt: '1979-10-01',
              endAt: '2999-01-01',
              path: {
                stations: [
                  {
                    stationId: 'KET',
                    displayCode: 'ISL1',
                  },
                ],
              },
              operatingHours: {
                weekdays: {
                  start: '05:30',
                  end: '00:30',
                },
                weekends: {
                  start: '05:30',
                  end: '00:30',
                },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(dataDir, 'service/ISL_MULTI_CURRENT.json'),
      `${JSON.stringify(
        {
          id: 'ISL_MULTI_CURRENT',
          name: {
            'en-SG': 'Multiple Current Service',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          lineId: 'ISL',
          revisions: [
            {
              id: 'r_ket',
              startAt: '1979-10-01',
              endAt: null,
              path: {
                stations: [
                  {
                    stationId: 'KET',
                    displayCode: 'ISL1',
                  },
                ],
              },
              operatingHours: {
                weekdays: {
                  start: '05:30',
                  end: '00:30',
                },
                weekends: {
                  start: '05:30',
                  end: '00:30',
                },
              },
            },
            {
              id: 'r_hku',
              startAt: '1979-10-01',
              endAt: null,
              path: {
                stations: [
                  {
                    stationId: 'HKU',
                    displayCode: 'ISL2',
                  },
                ],
              },
              operatingHours: {
                weekdays: {
                  start: '05:30',
                  end: '00:30',
                },
                weekends: {
                  start: '05:30',
                  end: '00:30',
                },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = await validateDataRoot(dataDir, ['station']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'station/KET.json: firstLastTrain.services.1.serviceId ISL_MAIN_E duplicates firstLastTrain.services.0.serviceId',
        'station/KET.json: firstLastTrain.services.2.serviceId MISSING does not exist in service/',
        'station/KET.json: firstLastTrain.services.3.serviceId TWL_MAIN_N does not include station KET in any service revision',
      ]),
    );
    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        'station/KET.json: firstLastTrain.services.4.serviceId ISL_ENDED does not have a current service revision',
        'station/KET.json: firstLastTrain.services.5.serviceId ISL_FUTURE_ENDED does not have a current service revision',
        'station/KET.json: firstLastTrain.services.6.serviceId ISL_MULTI_CURRENT revision r_hku does not include station KET in its current service path',
      ]),
    );
  });

  it('rejects invalid station layout relationships', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await writeFile(
      join(dataDir, 'station/KET.json'),
      `${JSON.stringify(
        {
          id: 'KET',
          name: {
            'en-SG': 'Kennedy Town',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          geo: {
            latitude: 22.2813,
            longitude: 114.1286,
          },
          stationCodes: [
            {
              lineId: 'ISL',
              code: 'ISL1',
              startedAt: '1979-10-01',
              endedAt: null,
              structureType: 'underground',
            },
          ],
          landmarkIds: [],
          townId: 'central-western',
          aliases: ['Kennedy Town MRT', ' kennedy   town mrt '],
          firstLastTrain: {
            services: [
              {
                serviceId: 'ISL_MAIN_E',
                times: {
                  weekday: {
                    firstTrain: '06:00',
                    lastTrain: '00:50',
                  },
                },
              },
            ],
          },
          layout: {
            levels: [
              {
                id: 'B2',
                index: -2,
                name: {
                  'en-SG': 'Platforms',
                  'zh-Hans': null,
                  ms: null,
                  ta: null,
                },
              },
              {
                id: 'B2',
                index: -2,
                name: {
                  'en-SG': 'Duplicate platforms',
                  'zh-Hans': null,
                  ms: null,
                  ta: null,
                },
              },
            ],
            exits: [
              {
                id: 'KET_EXIT_A',
                label: 'A',
                levelId: 'MISSING',
                nearbyLandmarkIds: ['missing-landmark'],
                paidArea: false,
              },
              {
                id: 'KET_EXIT_B',
                label: 'a',
                paidArea: false,
              },
            ],
            platforms: [
              {
                id: 'KET_ISL_A',
                label: 'A',
                lineId: 'ISL',
                levelId: 'MISSING',
                serviceIds: ['MISSING_SERVICE'],
                doorCount: 24,
                accessPoints: [
                  {
                    id: 'KET_AP_DUP',
                    kind: 'escalator',
                    nearestDoor: '25',
                    position: 'middle',
                    connectsToLevelId: 'MISSING',
                  },
                ],
              },
              {
                id: 'KET_TWL_A',
                label: 'A',
                lineId: 'ISL',
                serviceIds: ['TWL_MAIN_N', 'ISL_SKIP_KET'],
                accessPoints: [
                  {
                    id: 'KET_AP_DUP',
                    kind: 'stairs',
                    position: 'front',
                  },
                ],
              },
            ],
            transferPaths: [
              {
                id: 'KET_TRANSFER',
                from: {
                  kind: 'platform',
                  id: 'MISSING_PLATFORM',
                },
                to: {
                  kind: 'access_point',
                  id: 'MISSING_ACCESS_POINT',
                },
                paidArea: true,
                modes: ['walk'],
                levelChange: null,
                classification: 'unknown',
                estimatedTraversalSeconds: null,
                distanceMeters: null,
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(dataDir, 'service/ISL_SKIP_KET.json'),
      `${JSON.stringify(
        {
          id: 'ISL_SKIP_KET',
          name: {
            'en-SG': 'Skip Kennedy Town Service',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          lineId: 'ISL',
          revisions: [
            {
              id: 'r_current',
              startAt: '1979-10-01',
              endAt: null,
              path: {
                stations: [
                  {
                    stationId: 'HKU',
                    displayCode: 'ISL2',
                  },
                ],
              },
              operatingHours: {
                weekdays: {
                  start: '05:30',
                  end: '00:30',
                },
                weekends: {
                  start: '05:30',
                  end: '00:30',
                },
              },
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      join(dataDir, 'station/WAC.json'),
      `${JSON.stringify(
        {
          id: 'WAC',
          name: {
            'en-SG': 'Wan Chai',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          geo: {
            latitude: 22.2839,
            longitude: 114.1354,
          },
          stationCodes: [
            {
              lineId: 'ISL',
              code: 'ISL7',
              startedAt: '1979-10-01',
              endedAt: null,
              structureType: 'underground',
            },
          ],
          landmarkIds: [],
          townId: 'central-western',
          aliases: ['kennedy town mrt'],
        },
        null,
        2,
      )}\n`,
    );

    const result = await validateDataRoot(dataDir, ['station']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'station/KET.json: layout.levels.1 duplicates B2 (first seen at layout.levels.0)',
        'station/KET.json: aliases.1 duplicates kennedy town mrt (first seen at aliases.0)',
        'station/WAC.json: aliases.0 duplicates kennedy town mrt from station/KET.json:aliases.0',
        'station/KET.json: layout.exits.label.1 duplicates a (first seen at layout.exits.label.0)',
        'station/KET.json: layout.platforms.1.accessPoints.0.id KET_AP_DUP duplicates another access point id in layout',
        'station/KET.json: layout.exits.0.levelId MISSING does not exist in layout.levels',
        'station/KET.json: layout.exits.0.nearbyLandmarkIds.0 missing-landmark does not exist in landmark/',
        'station/KET.json: layout.platforms.0.levelId MISSING does not exist in layout.levels',
        'station/KET.json: layout.platforms.0.serviceIds.0 MISSING_SERVICE does not exist in service/',
        'station/KET.json: layout.platforms.1.serviceIds.0 TWL_MAIN_N belongs to line TWL, not ISL',
        'station/KET.json: layout.platforms.1.serviceIds.1 ISL_SKIP_KET does not include station KET in any service revision',
        'station/KET.json: layout.platforms.0.accessPoints.0.connectsToLevelId MISSING does not exist in layout.levels',
        'station/KET.json: layout.platforms.0.accessPoints.0.nearestDoor 25 is outside doorCount 24',
        'station/KET.json: layout.transferPaths.0.from platform MISSING_PLATFORM does not exist in layout',
        'station/KET.json: layout.transferPaths.0.to access_point MISSING_ACCESS_POINT does not exist in layout',
        'station/KET.json: firstLastTrain.services.0.serviceId ISL_MAIN_E is not served by any layout platform',
      ]),
    );
  });

  it('rejects service revisions outside station code active windows', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    await mkdir(join(dataDir, 'line'), { recursive: true });
    await mkdir(join(dataDir, 'service'), { recursive: true });
    await mkdir(join(dataDir, 'station'), { recursive: true });
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
        serviceIds: ['NSL_MAIN_S'],
        operators: [],
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'station/MSP.json'),
      `${JSON.stringify({
        id: 'MSP',
        name: {
          'en-SG': 'Marina South Pier',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        geo: {
          latitude: 1.2713,
          longitude: 103.8629,
        },
        stationCodes: [
          {
            lineId: 'NSL',
            code: 'NS28',
            startedAt: '2014-11-23',
            endedAt: null,
            structureType: 'underground',
          },
        ],
        landmarkIds: [],
        townId: 'marina-south',
      })}\n`,
    );
    await writeFile(
      join(dataDir, 'service/NSL_MAIN_S.json'),
      `${JSON.stringify({
        id: 'NSL_MAIN_S',
        name: {
          'en-SG': 'Main Service - Southbound',
          'zh-Hans': null,
          ms: null,
          ta: null,
        },
        lineId: 'NSL',
        revisions: [
          {
            id: 'r_2014_marina_south_pier',
            startAt: '2010-01-01',
            endAt: null,
            path: {
              stations: [
                {
                  stationId: 'MSP',
                  displayCode: 'NS28',
                },
              ],
            },
            operatingHours: {
              weekdays: {
                start: '05:07',
                end: '01:00',
              },
              weekends: {
                start: '05:35',
                end: '01:00',
              },
            },
          },
        ],
      })}\n`,
    );

    const result = await validateDataRoot(dataDir, ['service']);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'service/NSL_MAIN_S.json: revisions.0.path.stations.0.displayCode NS28 for station MSP is outside the station code active window',
    ]);
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

  it('rejects duplicate issue ids while building the issue index', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const issueId = '2026-01-01-duplicate-issue';

    for (const month of ['01', '02']) {
      const issueDir = join(dataDir, 'issue', '2026', month, issueId);
      await mkdir(issueDir, { recursive: true });
      await writeFile(
        join(issueDir, 'issue.json'),
        `${JSON.stringify({
          id: issueId,
          type: 'disruption',
          title: {
            'en-SG': 'Duplicate Issue',
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
    }

    const repo = new MRTDownRepository({ store: new FileStore(dataDir) });

    expect(() => repo.issues.listIds()).toThrow(
      "Duplicate issue id '2026-01-01-duplicate-issue' while indexing issue/2026/02/2026-01-01-duplicate-issue (first seen at issue/2026/01/2026-01-01-duplicate-issue)",
    );
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
      await readFile(join(fixtureDataDir, 'station/KET.json'), 'utf8'),
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

  it('rejects duplicate standard writer ids without clobbering files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-'));
    const writer = new StandardWriter<TestRepositoryItem>(
      new FileWriteStore(dataDir),
      'items',
    );

    writer.create({ id: 'duplicate', value: 'first' });

    expect(() => writer.create({ id: 'duplicate', value: 'second' })).toThrow(
      'Item already exists: duplicate',
    );
    await expect(
      readFile(join(dataDir, 'items/duplicate.json'), 'utf8'),
    ).resolves.toContain('"value": "first"');
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

  it('rejects write store paths that escape the data root', async () => {
    const parentDir = await mkdtemp(join(tmpdir(), 'mrtdown-fs-parent-'));
    const dataDir = join(parentDir, 'data');
    await mkdir(dataDir);
    await writeFile(join(parentDir, 'outside.txt'), 'outside');
    const store = new FileWriteStore(dataDir);

    expect(() => store.writeText('../outside.txt', 'changed')).toThrow(
      'Path escapes store root: ../outside.txt',
    );
    expect(() => store.appendText('../outside.txt', 'changed')).toThrow(
      'Path escapes store root: ../outside.txt',
    );
    expect(() => store.ensureDir('..')).toThrow('Path escapes store root: ..');
    expect(() => store.createDir('../created')).toThrow(
      'Path escapes store root: ../created',
    );
    expect(() => store.delete('../outside.txt')).toThrow(
      'Path escapes store root: ../outside.txt',
    );
    await expect(
      readFile(join(parentDir, 'outside.txt'), 'utf8'),
    ).resolves.toBe('outside');
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
      '2026-02-07-isl-maintenance',
    );
    await mkdir(issueDir, { recursive: true });
    await writeFile(
      join(issueDir, 'issue.json'),
      `${JSON.stringify({
        id: '2026-02-01-isl-maintenance',
        type: 'maintenance',
        title: {
          'en-SG': 'Island Line Maintenance',
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
      readIssueBundle(dataDir, '2026-02-07-isl-maintenance'),
    ).rejects.toThrow(
      'Issue id mismatch: folder 2026-02-07-isl-maintenance contains 2026-02-01-isl-maintenance',
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
