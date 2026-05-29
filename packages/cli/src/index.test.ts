import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readSchematicMapVersionSnapshot,
  writeSchematicMapConstraintSet,
  writeSchematicMapManifest,
  writeSchematicMapRuleSet,
  writeSchematicMapVersionSnapshot,
} from '@mrtdown/fs';
import { describe, expect, it } from 'vitest';
import { runCli } from './index.js';

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
  stations: { primary: { id: string; name: string } };
};

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

async function seedSchematicMap(
  dataDir: string,
  options: { writeConstraintSet?: boolean } = {},
): Promise<void> {
  const writeConstraintSet = options.writeConstraintSet ?? true;
  await writeSchematicMapRuleSet(dataDir, {
    schemaVersion: 1,
    mapId: 'system',
    layoutEngineId: 'lta-system-map-2011',
    lineOrder: ['ISL'],
  });

  if (writeConstraintSet) {
    await writeSchematicMapConstraintSet(dataDir, {
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
          id: 'anchor_ket',
          type: 'station_anchor',
          stationId: 'KET',
          point: { x: 100, y: 100 },
        },
      ],
    });
  }

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
              coordinateClass: 'artifact',
              generatedFrom: 'node_ket',
            },
          },
        ],
        coordinateMetadata: {
          ...(writeConstraintSet
            ? {
                coordinateClass: 'constraint' as const,
                constraintId: 'anchor_ket',
              }
            : {
                coordinateClass: 'generated' as const,
                ruleId: 'fixture-node',
              }),
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
              coordinateClass: 'artifact',
              generatedFrom: 'node_hku',
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
        layerId: 'lines',
        anchor: { x: 100, y: 84 },
        side: 'top',
        coordinateMetadata: {
          coordinateClass: 'generated',
          ruleId: 'fixture-label',
        },
      },
    ],
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
}

describe('@mrtdown/cli', () => {
  it('validates fixture data', async () => {
    const { io, stdout, stderr } = createIo();
    const code = await runCli(['--data-dir', fixtureDataDir, 'validate'], io);

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout[0] as string)).toMatchObject(fixtureMeta.counts);
  });

  it('lists and shows records', async () => {
    const list = createIo();
    await expect(
      runCli(['--data-dir', fixtureDataDir, 'list', 'issue'], list.io),
    ).resolves.toBe(0);
    expect((list.stdout[0] as string).split('\n')).toEqual(
      fixtureMeta.issueOrder,
    );

    const show = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          fixtureDataDir,
          'show',
          'station',
          fixtureMeta.stations.primary.id,
        ],
        show.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(show.stdout[0] as string).value.name['en-SG']).toBe(
      fixtureMeta.stations.primary.name,
    );
  });

  it('creates issues through the CLI', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    const { io, stdout } = createIo();

    const code = await runCli(
      [
        '--data-dir',
        dataDir,
        'create',
        'issue',
        '--date',
        '2026-05-12',
        '--title',
        'Signal fault at Test Station',
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([
      'issue/2026/05/2026-05-12-signal-fault-at-test-station',
    ]);
  });

  it('creates static entities from JSON files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    const { io, stdout } = createIo();

    const code = await runCli(
      [
        '--data-dir',
        dataDir,
        'create',
        'station',
        '--file',
        resolve(
          fixtureDataDir,
          `station/${fixtureMeta.stations.primary.id}.json`,
        ),
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([`station/${fixtureMeta.stations.primary.id}.json`]);
    await expect(
      readFile(
        resolve(dataDir, `station/${fixtureMeta.stations.primary.id}.json`),
        'utf8',
      ),
    ).resolves.toContain(fixtureMeta.stations.primary.name);
  });

  it('resolves create --file relative to the provided cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'mrtdown-cli-cwd-'));
    const stationFilename = `${fixtureMeta.stations.primary.id}.json`;
    await writeFile(
      join(cwd, stationFilename),
      await readFile(
        resolve(fixtureDataDir, `station/${stationFilename}`),
        'utf8',
      ),
    );
    const { io, stdout } = createIo();

    const code = await runCli(
      ['--data-dir', 'data', 'create', 'station', '--file', stationFilename],
      io,
      cwd,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual([`station/${stationFilename}`]);
    await expect(
      readFile(resolve(cwd, `data/station/${stationFilename}`), 'utf8'),
    ).resolves.toContain(fixtureMeta.stations.primary.name);
  });

  it('validates and inspects schematic map files', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir);

    const validate = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'validate', '--scope', 'schematic-map'],
        validate.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(validate.stdout[0] as string)['schematic-map']).toBe(4);

    const list = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'list', 'version'],
        list.io,
      ),
    ).resolves.toBe(0);
    expect(list.stdout).toEqual(['2025-04']);

    const show = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'show',
          'constraint',
          '2025-04',
        ],
        show.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(show.stdout[0] as string).value.constraints).toHaveLength(
      2,
    );

    const select = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'select', '2025-04-15'],
        select.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(select.stdout[0] as string)).toEqual({
      effectiveDate: '2025-04',
      path: 'version/2025-04.json',
      layoutEngineId: 'lta-system-map-2011',
    });

    const stats = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'stats', '2025-04'],
        stats.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(stats.stdout[0] as string)).toEqual({
      effectiveDate: '2025-04',
      coordinates: {
        total: 7,
        byClass: {
          artifact: 2,
          constraint: 1,
          exception: 0,
          generated: 4,
        },
      },
      constraints: {
        total: 2,
        byType: {
          interchange_hint: 0,
          label_hint: 0,
          line_order: 0,
          map_frame: 1,
          segment_route_hint: 0,
          station_anchor: 1,
        },
      },
    });
  });

  it('reports schematic map stats without a constraint set', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir, { writeConstraintSet: false });

    const validate = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'validate', '--scope', 'schematic-map'],
        validate.io,
      ),
    ).resolves.toBe(0);

    const stats = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'stats', '2025-04'],
        stats.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(stats.stdout[0] as string)).toMatchObject({
      constraints: {
        total: 0,
      },
    });
  });

  it('reports semantic schematic map diffs for reviewers', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir);
    const baseSnapshot = (
      await readSchematicMapVersionSnapshot(dataDir, '2025-04')
    ).value;
    await writeSchematicMapVersionSnapshot(dataDir, {
      ...baseSnapshot,
      effectiveDate: '2025-05',
      generatedAt: '2026-05-28T00:00:00.000Z',
      segments: baseSnapshot.segments.map((segment) =>
        segment.id === 'line_ket:hku'
          ? {
              ...segment,
              geometry: {
                ...segment.geometry,
                points: [
                  { x: 120, y: 120 },
                  { x: 220, y: 120 },
                ],
              },
            }
          : segment,
      ),
      stationNodes: baseSnapshot.stationNodes.map((node) =>
        node.stationId === 'KET'
          ? {
              ...node,
              center: { x: 120, y: 120 },
            }
          : node,
      ),
      labels: [
        ...baseSnapshot.labels.map((label) =>
          label.id === 'label_ket'
            ? {
                ...label,
                anchor: { x: 120, y: 104 },
              }
            : label,
        ),
        {
          id: 'label_hku',
          stationId: 'HKU',
          displayStatus: 'operational',
          layerId: 'lines',
          anchor: { x: 200, y: 84 },
          side: 'top',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-label',
          },
        },
      ],
    });

    const diff = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'diff', '2025-04', '2025-05'],
        diff.io,
      ),
    ).resolves.toBe(0);

    expect(JSON.parse(diff.stdout[0] as string)).toMatchObject({
      from: '2025-04',
      to: '2025-05',
      stations: {
        added: [],
        removed: [],
        moved: ['KET'],
        lineMembershipChanged: [],
      },
      segments: {
        added: [],
        removed: [],
        geometryChanged: ['line_ket:hku'],
        topologyChanged: [],
        metadataChanged: [],
      },
      labels: {
        added: ['label_hku'],
        removed: [],
        moved: ['label_ket'],
        sideChanged: [],
        stationChanged: [],
      },
      coordinates: {
        delta: {
          artifact: 0,
          constraint: 0,
          exception: 0,
          generated: 1,
        },
      },
    });
  });

  it('generates and writes schematic map snapshots through the CLI', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
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
    const { io, stdout } = createIo();

    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'generate',
          '2026-05',
          '--generated-at',
          '2026-05-27T00:00:00.000Z',
          '--write',
        ],
        io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(stdout[0] as string)).toEqual({
      snapshot: 'schematic-map/system/version/2026-05.json',
      manifest: 'schematic-map/system/manifest.json',
    });

    const validate = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'validate', '--scope', 'schematic-map'],
        validate.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(validate.stdout[0] as string)['schematic-map']).toBe(4);

    const previewPath = join(dataDir, 'preview.svg');
    const preview = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'preview',
          '2026-05',
          '--out',
          previewPath,
        ],
        preview.io,
      ),
    ).resolves.toBe(0);
    expect(preview.stdout).toEqual([previewPath]);
    await expect(readFile(previewPath, 'utf8')).resolves.toContain(
      'Kennedy Town',
    );
  });
});
