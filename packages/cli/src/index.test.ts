import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createIssueBundle,
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

  it('prints issue ids with explicit slugs', async () => {
    const { io, stdout } = createIo();

    const code = await runCli(
      [
        'id',
        'issue',
        '--date',
        '2026-05-12',
        '--title',
        'Signal fault at Test Station',
        '--slug',
        'custom-signal-fault',
      ],
      io,
    );

    expect(code).toBe(0);
    expect(stdout).toEqual(['2026-05-12-custom-signal-fault']);
  });

  it('displays an issue current derived state', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    const issueId = '2026-05-12-signal-fault-at-test-station';
    await createIssueBundle(
      dataDir,
      {
        id: issueId,
        title: 'Signal fault at Test Station',
      },
      [],
      [
        {
          id: 'impact-001',
          type: 'service_effects.set',
          ts: '2026-05-12T08:00:00+08:00',
          entity: {
            type: 'service',
            serviceId: 'ISL_MAIN',
          },
          effect: {
            kind: 'delay',
            duration: 'PT10M',
          },
          basis: {
            evidenceId: 'evidence-001',
          },
        },
      ],
    );
    const { io, stdout } = createIo();

    const code = await runCli(
      ['--data-dir', dataDir, 'issue', 'state', issueId],
      io,
    );

    expect(code).toBe(0);
    expect(JSON.parse(stdout[0] as string)).toMatchObject({
      services: {
        'service:ISL_MAIN': {
          serviceId: 'ISL_MAIN',
          effect: {
            kind: 'delay',
            duration: 'PT10M',
          },
        },
      },
      servicesProvenance: {
        'service:ISL_MAIN': {
          effect: {
            evidenceId: 'evidence-001',
          },
        },
      },
      impactEventIds: ['impact-001'],
    });
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

    const invalidSelect = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'select', '2025-04-31'],
        invalidSelect.io,
      ),
    ).resolves.toBe(1);
    expect(invalidSelect.stderr).toEqual([
      'Expected YYYY-MM or YYYY-MM-DD, got: 2025-04-31',
    ]);

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

  it('inventories reference schematic map TSX snapshots', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    const fixtureStationPath = join(dataDir, 'station', 'KET.json');
    const fixtureStation = JSON.parse(
      await readFile(fixtureStationPath, 'utf8'),
    );
    fixtureStation.stationCodes.push(
      {
        lineId: 'CRL',
        code: 'CR6',
        startedAt: '2030-01-01T00:00:00Z',
        endedAt: null,
        structureType: 'underground',
      },
      {
        lineId: 'CRL',
        code: 'CP1',
        startedAt: '2030-01-01T00:00:00Z',
        endedAt: null,
        structureType: 'underground',
      },
      {
        lineId: 'EWL',
        code: 'CG',
        startedAt: '2030-01-01T00:00:00Z',
        endedAt: null,
        structureType: 'underground',
      },
      {
        lineId: 'PGLRT',
        code: 'PTC',
        startedAt: '2030-01-01T00:00:00Z',
        endedAt: null,
        structureType: 'at_grade',
      },
      {
        lineId: 'SKLRT',
        code: 'STC',
        startedAt: '2030-01-01T00:00:00Z',
        endedAt: null,
        structureType: 'at_grade',
      },
    );
    await writeFile(
      fixtureStationPath,
      `${JSON.stringify(fixtureStation, null, 2)}\n`,
    );

    const siteDir = await mkdtemp(join(tmpdir(), 'mrtdown-site-'));
    const mapDir = join(
      siteDir,
      'app',
      'components',
      'StationMap',
      'components',
    );
    await mkdir(mapDir, { recursive: true });
    await writeFile(
      join(mapDir, 'MapApr2025.tsx'),
      [
        'export function MapApr2025() {',
        '  return (',
        '    <svg viewBox="0 0 3140 2400">',
        '      <g id="System Map (2025)">',
        '        <g id="lines">',
        '          <g id="line_isl">',
        '            <path id="line_ket:hku" d="M 0 0 L 10 10" />',
        '          </g>',
        '        </g>',
        '        <g id="labels">',
        '          <text id="label_ket">Kennedy Town</text>',
        '          <text id="ISL 1">ISL1</text>',
        '          <text id="CR 6">CR6</text>',
        '          <text id="CP 1">CP1</text>',
        '          <text id="CG">CG</text>',
        '          <text id="PTC">PTC</text>',
        '          <text id="STC">STC</text>',
        '        </g>',
        '        <g id="nodes">',
        '          <circle id="node_hku" />',
        '        </g>',
        '      </g>',
        '    </svg>',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(mapDir, 'MapJan2012.tsx'),
      [
        'export function MapJan2012() {',
        '  return <svg viewBox="0 0 3140 2400"><g id="System Map (2012)" /></svg>;',
        '}',
        '',
      ].join('\n'),
    );

    const inventory = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'inventory',
          '--site-dir',
          siteDir,
        ],
        inventory.io,
      ),
    ).resolves.toBe(0);
    const parsed = JSON.parse(inventory.stdout[0] as string);
    expect(parsed).toMatchObject({
      generatedAt: '1970-01-01T00:00:00.000Z',
      mapComponentDir: 'app/components/StationMap/components',
      maps: [
        {
          effectiveDate: '2012-01',
          componentName: 'MapJan2012',
        },
        {
          effectiveDate: '2025-04',
          componentName: 'MapApr2025',
          sourcePath: 'app/components/StationMap/components/MapApr2025.tsx',
          viewBox: '0 0 3140 2400',
          rootGroupId: 'System Map (2025)',
          lineCount: 25,
          counts: {
            lineGroups: 1,
            lineSegments: 1,
            stationLabels: 1,
            stationNodes: 1,
            stationCodes: 6,
            stationIds: 2,
            rawPathGeometry: 1,
            textElementsWithIds: 7,
          },
          layerOrder: ['lines', 'labels', 'nodes'],
          lineGroupIds: ['line_isl'],
          lineSegmentIds: ['line_ket:hku'],
          stationLabelIds: ['label_ket'],
          stationNodeIds: ['node_hku'],
          stationCodeIds: ['CG', 'CP 1', 'CR 6', 'ISL 1', 'PTC', 'STC'],
          stationIds: ['HKU', 'KET'],
          rawGeometryIds: ['line_ket:hku'],
        },
      ],
      firstTarget: {
        effectiveDate: '2025-04',
        componentName: 'MapApr2025',
      },
    });

    const outPath = join(siteDir, 'inventory.json');
    const write = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'inventory',
          '--site-dir',
          siteDir,
          '--write',
          outPath,
        ],
        write.io,
      ),
    ).resolves.toBe(0);
    expect(write.stdout).toEqual([outPath]);
    await expect(readFile(outPath, 'utf8')).resolves.toContain(
      '"componentName": "MapApr2025"',
    );
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
      stationCodeLabels: [
        {
          id: 'IS1',
          stationId: 'KET',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          anchor: { x: 100, y: 116 },
          side: 'bottom',
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-station-code-label',
          },
        },
      ],
    });
    await writeSchematicMapVersionSnapshot(dataDir, {
      ...baseSnapshot,
      effectiveDate: '2025-05',
      generatedAt: '2026-05-28T00:00:00.000Z',
      segments: baseSnapshot.segments.map((segment) =>
        segment.id === 'line_ket:hku'
          ? {
              ...segment,
              displayReason: 'Fixture display reason changed.',
              geometry: {
                ...segment.geometry,
                coordinateMetadata: {
                  coordinateClass: 'constraint',
                  constraintId: 'anchor_ket',
                },
              },
            }
          : segment,
      ),
      stationNodes: baseSnapshot.stationNodes.map((node) =>
        node.stationId === 'KET'
          ? {
              ...node,
              id: 'node_ket_updated',
              center: { x: 120, y: 120 },
              parts: node.parts.map((part) => ({
                ...part,
                shape: {
                  ...part.shape,
                  radius: part.shape.type === 'circle' ? 10 : part.shape.radius,
                },
              })),
            }
          : node,
      ),
      labels: [
        ...baseSnapshot.labels.map((label) =>
          label.id === 'label_ket'
            ? {
                ...label,
                anchor: { x: 120, y: 104 },
                rotationDegrees: 45,
                leaderLine: {
                  type: 'polyline',
                  points: [
                    { x: 110, y: 100 },
                    { x: 120, y: 104 },
                  ],
                  coordinateMetadata: {
                    coordinateClass: 'generated',
                    ruleId: 'fixture-label-leader',
                  },
                },
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
      stationCodeLabels: [
        {
          id: 'IS1',
          stationId: 'KET',
          lineId: 'ISL',
          displayStatus: 'operational',
          layerId: 'lines',
          anchor: { x: 100, y: 116 },
          side: 'top',
          rotationDegrees: 45,
          coordinateMetadata: {
            coordinateClass: 'generated',
            ruleId: 'fixture-station-code-label',
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
        idChanged: ['KET'],
        moved: ['KET'],
        lineMembershipChanged: [],
        partsChanged: ['KET'],
        metadataChanged: [],
      },
      segments: {
        added: [],
        removed: [],
        geometryChanged: [],
        geometryMetadataChanged: ['line_ket:hku'],
        topologyChanged: [],
        metadataChanged: ['line_ket:hku'],
      },
      labels: {
        added: ['label_hku'],
        removed: [],
        moved: ['label_ket'],
        sideChanged: [],
        stationChanged: [],
        leaderLineChanged: ['label_ket'],
        metadataChanged: ['label_ket'],
      },
      stationCodeLabels: {
        added: [],
        removed: [],
        moved: [],
        sideChanged: ['IS1'],
        stationChanged: [],
        metadataChanged: ['IS1'],
      },
      coordinates: {
        delta: {
          artifact: 0,
          constraint: 2,
          exception: 0,
          generated: 1,
        },
      },
    });
  });

  it('reports schematic map generator input diffs for reviewers', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir);
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-05',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2025_04',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 3596, height: 2400 },
          reason: 'Fixture frame changed.',
        },
        {
          id: 'label_ket',
          type: 'label_hint',
          stationId: 'KET',
          side: 'bottom',
        },
        {
          id: 'line_order_2025_05',
          type: 'line_order',
          lineIds: ['TKL', 'ISL'],
        },
        {
          id: 'segment_ket_hku',
          type: 'segment_route_hint',
          lineId: 'ISL',
          fromStationId: 'KET',
          toStationId: 'HKU',
          via: [{ x: 150, y: 140 }],
        },
      ],
    });

    const diff = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'generator-diff',
          '2025-04',
          '2025-05',
        ],
        diff.io,
      ),
    ).resolves.toBe(0);

    expect(JSON.parse(diff.stdout[0] as string)).toEqual({
      from: '2025-04',
      to: '2025-05',
      layoutEngine: {
        changed: false,
        from: 'lta-system-map-2011',
        to: 'lta-system-map-2011',
      },
      rules: {
        changed: false,
        lineOrderChanged: true,
        fromLineOrder: ['ISL'],
        toLineOrder: ['TKL', 'ISL'],
      },
      constraints: {
        added: ['label_ket', 'line_order_2025_05', 'segment_ket_hku'],
        removed: ['anchor_ket'],
        changed: ['frame_2025_04'],
        byType: {
          from: {
            interchange_hint: 0,
            label_hint: 0,
            line_order: 0,
            map_frame: 1,
            segment_route_hint: 0,
            station_anchor: 1,
          },
          to: {
            interchange_hint: 0,
            label_hint: 1,
            line_order: 1,
            map_frame: 1,
            segment_route_hint: 1,
            station_anchor: 0,
          },
          delta: {
            interchange_hint: 0,
            label_hint: 1,
            line_order: 1,
            map_frame: 0,
            segment_route_hint: 1,
            station_anchor: -1,
          },
        },
      },
    });
  });

  it('copies schematic map constraints forward for a new version', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir);

    const preview = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'copy-constraints',
          '2025-04',
          '2025-06',
        ],
        preview.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(preview.stdout[0] as string)).toMatchObject({
      effectiveDate: '2025-06',
      constraints: [
        {
          id: 'frame_2025_06',
          type: 'map_frame',
        },
        {
          id: 'anchor_ket',
          type: 'station_anchor',
        },
      ],
    });

    const listBeforeWrite = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'schematic-map', 'list', 'constraint'],
        listBeforeWrite.io,
      ),
    ).resolves.toBe(0);
    expect(listBeforeWrite.stdout).toEqual(['2025-04']);

    const write = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'copy-constraints',
          '2025-04',
          '2025-06',
          '--write',
        ],
        write.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(write.stdout[0] as string)).toEqual({
      constraint: 'schematic-map/system/generator/constraint/2025-06.json',
    });

    const overwrite = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'copy-constraints',
          '2025-04',
          '2025-06',
          '--write',
        ],
        overwrite.io,
      ),
    ).resolves.toBe(1);
    expect(overwrite.stderr).toEqual([
      'Schematic map constraint set already exists for 2025-06; pass --force to overwrite',
    ]);

    const validate = createIo();
    await expect(
      runCli(
        ['--data-dir', dataDir, 'validate', '--scope', 'schematic-map'],
        validate.io,
      ),
    ).resolves.toBe(0);
  });

  it('validates schematic map designer submission bundles', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-cli-'));
    await cp(fixtureDataDir, dataDir, { recursive: true });
    await seedSchematicMap(dataDir);
    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-06',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2025_06',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 1200, height: 600 },
          reason: 'Fixture designer submission frame.',
        },
        {
          id: 'label_ket',
          type: 'label_hint',
          stationId: 'KET',
          side: 'bottom',
        },
      ],
    });
    const bundlePath = join(dataDir, 'submission.json');
    await writeFile(
      bundlePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          type: 'schematic-map-designer-submission',
          mapId: 'system',
          sourceEffectiveDate: '2025-04',
          targetEffectiveDate: '2025-06',
          layoutEngineId: 'lta-system-map-2011',
          source: {
            tool: 'mrtdown-site-map-designer',
          },
          summary: 'Move fixture label below Kennedy Town.',
          files: {
            constraint:
              'schematic-map/system/generator/constraint/2025-06.json',
            semanticDiff: 'artifacts/schematic-map/2025-04..2025-06.json',
            generatorDiff:
              'artifacts/schematic-map/2025-04..2025-06.generator.json',
            preview: 'artifacts/schematic-map/2025-06.svg',
          },
          notes: ['Fixture review note.'],
        },
        null,
        2,
      ),
    );

    const validate = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'validate-submission',
          '--file',
          bundlePath,
        ],
        validate.io,
      ),
    ).resolves.toBe(0);
    expect(JSON.parse(validate.stdout[0] as string)).toMatchObject({
      type: 'schematic-map-designer-submission',
      sourceEffectiveDate: '2025-04',
      targetEffectiveDate: '2025-06',
      layoutEngineId: 'lta-system-map-2011',
      constraints: {
        path: 'schematic-map/system/generator/constraint/2025-06.json',
        total: 2,
        byType: {
          label_hint: 1,
          map_frame: 1,
        },
      },
      validation: {
        'schematic-map': 5,
      },
      generatorDiff: {
        from: '2025-04',
        to: '2025-06',
        constraints: {
          added: ['frame_2025_06', 'label_ket'],
          removed: ['anchor_ket', 'frame_2025_04'],
        },
      },
      semanticDiff: {
        from: '2025-04',
        to: '2025-06',
      },
      notes: ['Fixture review note.'],
    });

    const invalidBundlePath = join(dataDir, 'invalid-submission.json');
    await writeFile(
      invalidBundlePath,
      JSON.stringify({
        schemaVersion: 1,
        type: 'schematic-map-designer-submission',
        mapId: 'system',
        sourceEffectiveDate: '2025-04',
        targetEffectiveDate: '2025-06',
        layoutEngineId: 'lta-system-map-2011',
        source: { tool: 'mrtdown-site-map-designer' },
        summary: 'Invalid path fixture.',
        files: {
          constraint: 'schematic-map/system/generator/constraint/wrong.json',
        },
      }),
    );
    const invalid = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'validate-submission',
          '--file',
          invalidBundlePath,
        ],
        invalid.io,
      ),
    ).resolves.toBe(1);
    expect(invalid.stderr).toEqual([
      'submission.files.constraint must be schematic-map/system/generator/constraint/2025-06.json',
    ]);

    await writeSchematicMapConstraintSet(dataDir, {
      schemaVersion: 1,
      mapId: 'system',
      effectiveDate: '2025-07',
      layoutEngineId: 'lta-system-map-2011',
      constraints: [
        {
          id: 'frame_2025_07',
          type: 'map_frame',
          frame: { x: 0, y: 0, width: 1200, height: 600 },
        },
        {
          id: 'label_nope',
          type: 'label_hint',
          stationId: 'NOPE',
          side: 'bottom',
        },
      ],
    });
    const invalidReferenceBundlePath = join(
      dataDir,
      'invalid-reference-submission.json',
    );
    await writeFile(
      invalidReferenceBundlePath,
      JSON.stringify({
        schemaVersion: 1,
        type: 'schematic-map-designer-submission',
        mapId: 'system',
        sourceEffectiveDate: '2025-04',
        targetEffectiveDate: '2025-07',
        layoutEngineId: 'lta-system-map-2011',
        source: { tool: 'mrtdown-site-map-designer' },
        summary: 'Invalid reference fixture.',
        files: {
          constraint: 'schematic-map/system/generator/constraint/2025-07.json',
        },
      }),
    );
    const invalidReference = createIo();
    await expect(
      runCli(
        [
          '--data-dir',
          dataDir,
          'schematic-map',
          'validate-submission',
          '--file',
          invalidReferenceBundlePath,
        ],
        invalidReference.io,
      ),
    ).resolves.toBe(1);
    expect(invalidReference.stderr).toEqual([
      [
        'Schematic map validation failed:',
        'schematic-map/system/generator/constraint/2025-07.json: constraints.1.stationId NOPE does not exist in station/',
      ].join('\n'),
    ]);
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
