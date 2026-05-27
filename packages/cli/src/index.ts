#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IssueTypeSchema,
  type SchematicMapConstraint,
  type SchematicMapCoordinateMetadata,
  SchematicMapEffectiveDateSchema,
  SchematicMapLayoutEngineIdSchema,
  type SchematicMapManifest,
  type SchematicMapManifestVersion,
  type SchematicMapVersionSnapshot,
} from '@mrtdown/core';
import {
  buildIssueId,
  buildManifest,
  createIssueBundle,
  type EntityCollection,
  entityCollections,
  generateSchematicMapVersionSnapshot,
  listEntityIds,
  listIssueIds,
  listSchematicMapConstraintSetEffectiveDates,
  listSchematicMapVersionSnapshotEffectiveDates,
  readEntity,
  readIssueBundle,
  readSchematicMapConstraintSet,
  readSchematicMapManifest,
  readSchematicMapRuleSet,
  readSchematicMapVersionSnapshot,
  renderPagesIndex,
  type ValidationScope,
  validateDataRoot,
  writeSchematicMapManifest,
  writeSchematicMapVersionSnapshot,
  writeUnknownEntity,
} from '@mrtdown/fs';

export type CliIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const defaultIo: CliIO = {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
};

type GlobalOptions = {
  cwd: string;
  dataDir: string;
};

type ParsedArgs = {
  globals: GlobalOptions;
  command: string[];
};

const usage = `Usage:
  mrtdown [--data-dir <path>] validate [--scope <scope>]
  mrtdown [--data-dir <path>] list <station|line|service|operator|town|landmark|issue>
  mrtdown [--data-dir <path>] show <station|line|service|operator|town|landmark|issue> <id>
  mrtdown [--data-dir <path>] schematic-map list <constraint|version>
  mrtdown [--data-dir <path>] schematic-map show <manifest|rules|constraint|version> [id]
  mrtdown [--data-dir <path>] schematic-map select <YYYY-MM|YYYY-MM-DD>
  mrtdown [--data-dir <path>] schematic-map stats <YYYY-MM>
  mrtdown [--data-dir <path>] schematic-map generate <YYYY-MM> [--generated-at <timestamp>] [--write]
  mrtdown [--data-dir <path>] schematic-map preview <YYYY-MM> [--out <path>]
  mrtdown [--data-dir <path>] create issue --date <YYYY-MM-DD> --title <title> [--slug <slug>] [--type <type>] [--source <source>]
  mrtdown [--data-dir <path>] create <station|line|service|operator|town|landmark> --file <path>
  mrtdown id issue --date <YYYY-MM-DD> --title <title>
  mrtdown [--data-dir <path>] manifest [--write]
  mrtdown [--data-dir <path>] pages-index [--write]
`;

function parseArgs(argv: readonly string[], cwd: string): ParsedArgs {
  const command = [...argv];
  let dataDir = resolve(cwd, 'data');

  for (let index = 0; index < command.length; index += 1) {
    const arg = command[index];
    if (arg !== '--data-dir' && arg !== '-d') {
      continue;
    }

    const value = command[index + 1];
    if (!value) {
      throw new Error('--data-dir requires a value');
    }
    dataDir = resolve(cwd, value);
    command.splice(index, 2);
    index -= 1;
  }

  return {
    globals: {
      cwd,
      dataDir,
    },
    command,
  };
}

function readOption(
  args: string[],
  name: string,
  options: { required?: boolean } = {},
): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    if (options.required) {
      throw new Error(`${name} is required`);
    }
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }

  args.splice(index, 2);
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function effectiveDateFromDate(value: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }

  if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) {
    return value.slice(0, 7);
  }

  throw new Error(`Expected YYYY-MM or YYYY-MM-DD, got: ${value}`);
}

function parseCollection(value: string): EntityCollection | 'issue' {
  if (
    value === 'issue' ||
    entityCollections.includes(value as EntityCollection)
  ) {
    return value as EntityCollection | 'issue';
  }
  throw new Error(`Unknown collection: ${value}`);
}

function parseValidationScope(value: string): ValidationScope {
  if (value === 'schematic-map') {
    return value;
  }
  return parseCollection(value);
}

function selectSchematicMapVersion(
  versions: SchematicMapManifestVersion[],
  at: string,
): SchematicMapManifestVersion | undefined {
  const effectiveDate = effectiveDateFromDate(at);
  return [...versions]
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
    .find((version) => version.effectiveDate <= effectiveDate);
}

type CoordinateClassCounts = Record<
  SchematicMapCoordinateMetadata['coordinateClass'],
  number
>;

type ConstraintTypeCounts = Record<SchematicMapConstraint['type'], number>;

function createCoordinateClassCounts(): CoordinateClassCounts {
  return {
    artifact: 0,
    constraint: 0,
    exception: 0,
    generated: 0,
  };
}

function incrementCoordinateClass(
  counts: CoordinateClassCounts,
  coordinateMetadata: SchematicMapCoordinateMetadata | undefined,
  by = 1,
): void {
  if (!coordinateMetadata) {
    return;
  }

  counts[coordinateMetadata.coordinateClass] += by;
}

function countSchematicMapSnapshotCoordinates(
  snapshot: SchematicMapVersionSnapshot,
): CoordinateClassCounts {
  const counts = createCoordinateClassCounts();
  incrementCoordinateClass(counts, snapshot.frame.coordinateMetadata);

  for (const segment of snapshot.segments) {
    incrementCoordinateClass(
      counts,
      segment.geometry.coordinateMetadata,
      segment.geometry.type === 'polyline' ? segment.geometry.points.length : 4,
    );
  }

  for (const node of snapshot.stationNodes) {
    incrementCoordinateClass(counts, node.coordinateMetadata);
    for (const part of node.parts) {
      incrementCoordinateClass(counts, part.coordinateMetadata);
    }
  }

  for (const label of snapshot.labels) {
    incrementCoordinateClass(counts, label.coordinateMetadata);
    incrementCoordinateClass(
      counts,
      label.leaderLine?.coordinateMetadata,
      label.leaderLine?.points.length ?? 1,
    );
  }

  for (const label of snapshot.stationCodeLabels) {
    incrementCoordinateClass(counts, label.coordinateMetadata);
  }

  return counts;
}

function countConstraintTypes(
  constraints: SchematicMapConstraint[],
): ConstraintTypeCounts {
  return constraints.reduce<ConstraintTypeCounts>(
    (counts, constraint) => {
      counts[constraint.type] += 1;
      return counts;
    },
    {
      interchange_hint: 0,
      label_hint: 0,
      line_order: 0,
      map_frame: 0,
      segment_route_hint: 0,
      station_anchor: 0,
    },
  );
}

const linePreviewColors: Record<string, string> = {
  BPLRT: '#748477',
  CCL: '#fa9e0d',
  CRL: '#97c616',
  DTL: '#005ec4',
  EWL: '#009645',
  JRL: '#0099aa',
  NEL: '#9900aa',
  NSL: '#d42e12',
  PGLRT: '#748477',
  SKLRT: '#748477',
  TEL: '#9d5b25',
};

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function previewColorForLine(lineId: string): string {
  return linePreviewColors[lineId] ?? '#555555';
}

function pointAttrs(point: { x: number; y: number }): string {
  return `x="${point.x}" y="${point.y}"`;
}

function renderGeometry(
  geometry: SchematicMapVersionSnapshot['segments'][number]['geometry'],
): string {
  if (geometry.type === 'polyline') {
    return geometry.points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  return `M ${geometry.start.x},${geometry.start.y} C ${geometry.control1.x},${geometry.control1.y} ${geometry.control2.x},${geometry.control2.y} ${geometry.end.x},${geometry.end.y}`;
}

function textAnchorForSide(side: string): string {
  if (side.endsWith('left') || side === 'left') {
    return 'end';
  }
  if (side.endsWith('right') || side === 'right') {
    return 'start';
  }
  return 'middle';
}

async function renderSchematicMapPreviewSvg(
  dataDir: string,
  snapshot: SchematicMapVersionSnapshot,
): Promise<string> {
  const stationNames = new Map<string, string>();
  await Promise.all(
    snapshot.stationNodes.map(async (node) => {
      const station = await readEntity(dataDir, 'station', node.stationId);
      stationNames.set(
        node.stationId,
        station.value.name['en-SG'] ?? node.stationId,
      );
    }),
  );

  const layerContent = snapshot.layers.map((layer) => {
    const segments = snapshot.segments
      .filter((segment) => segment.layerId === layer.id)
      .map((segment) => {
        const color = previewColorForLine(segment.lineId);
        if (segment.geometry.type === 'polyline') {
          return `<polyline id="${xmlEscape(segment.id)}" points="${renderGeometry(
            segment.geometry,
          )}" class="line-segment" stroke="${color}"><title>${xmlEscape(
            `${segment.lineId} ${segment.id}`,
          )}</title></polyline>`;
        }

        return `<path id="${xmlEscape(segment.id)}" d="${renderGeometry(
          segment.geometry,
        )}" class="line-segment" stroke="${color}"><title>${xmlEscape(
          `${segment.lineId} ${segment.id}`,
        )}</title></path>`;
      })
      .join('\n');

    const nodes = snapshot.stationNodes
      .filter((node) => node.layerId === layer.id)
      .flatMap((node) =>
        node.parts.map((part) => {
          const color = previewColorForLine(part.lineId);
          const title = xmlEscape(
            `${stationNames.get(node.stationId) ?? node.stationId} (${part.lineId})`,
          );

          if (part.shape.type === 'pill') {
            return `<rect id="${xmlEscape(part.id)}" x="${
              part.shape.center.x - part.shape.width / 2
            }" y="${part.shape.center.y - part.shape.height / 2}" width="${
              part.shape.width
            }" height="${part.shape.height}" rx="${
              part.shape.radius
            }" class="station-node" stroke="${color}"><title>${title}</title></rect>`;
          }

          return `<circle id="${xmlEscape(part.id)}" cx="${
            part.shape.center.x
          }" cy="${part.shape.center.y}" r="${
            part.shape.radius
          }" class="station-node" stroke="${color}"><title>${title}</title></circle>`;
        }),
      )
      .join('\n');

    const labels = snapshot.labels
      .filter((label) => label.layerId === layer.id)
      .map(
        (label) =>
          `<text id="${xmlEscape(label.id)}" ${pointAttrs(
            label.anchor,
          )} class="station-label" text-anchor="${textAnchorForSide(
            label.side,
          )}">${xmlEscape(stationNames.get(label.stationId) ?? label.stationId)}</text>`,
      )
      .join('\n');

    const stationCodeLabels = snapshot.stationCodeLabels
      .filter((label) => label.layerId === layer.id)
      .map(
        (label) =>
          `<text id="${xmlEscape(label.id)}" ${pointAttrs(
            label.anchor,
          )} class="station-code" text-anchor="${textAnchorForSide(
            label.side,
          )}">${xmlEscape(label.id)}</text>`,
      )
      .join('\n');

    return `<g id="${xmlEscape(layer.id)}" data-role="${xmlEscape(layer.role)}">
${segments}
${nodes}
${labels}
${stationCodeLabels}
</g>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${snapshot.frame.x} ${snapshot.frame.y} ${snapshot.frame.width} ${snapshot.frame.height}" width="${snapshot.frame.width}" height="${snapshot.frame.height}" role="img" aria-label="MRTDown schematic map preview ${snapshot.effectiveDate}">
<style>
  svg { background: #f7f6f2; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .line-segment { fill: none; stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
  .station-node { fill: #ffffff; stroke-width: 4; }
  .station-label { fill: #1f2933; font-size: 20px; font-weight: 650; dominant-baseline: middle; }
  .station-code { fill: #4b5563; font-size: 13px; font-weight: 700; dominant-baseline: middle; }
</style>
<rect x="${snapshot.frame.x}" y="${snapshot.frame.y}" width="${snapshot.frame.width}" height="${snapshot.frame.height}" fill="#f7f6f2"/>
${layerContent.join('\n')}
</svg>
`;
}

async function readOptionalSchematicMapManifest(
  dataDir: string,
): Promise<SchematicMapManifest | undefined> {
  try {
    return (await readSchematicMapManifest(dataDir)).value;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function updateSchematicMapManifest(
  dataDir: string,
  snapshot: SchematicMapVersionSnapshot,
): Promise<string> {
  const existing = await readOptionalSchematicMapManifest(dataDir);
  const versions = [
    ...(existing?.versions.filter(
      (version) => version.effectiveDate !== snapshot.effectiveDate,
    ) ?? []),
    {
      effectiveDate: snapshot.effectiveDate,
      path: `version/${snapshot.effectiveDate}.json`,
      layoutEngineId: snapshot.layoutEngineId,
    },
  ].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  return writeSchematicMapManifest(dataDir, {
    schemaVersion: 1,
    mapId: 'system',
    versions,
  });
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function runValidate(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const scopes: ValidationScope[] = [];
  for (
    let scope = readOption(args, '--scope');
    scope;
    scope = readOption(args, '--scope')
  ) {
    scopes.push(parseValidationScope(scope));
  }

  const result = await validateDataRoot(
    globals.dataDir,
    scopes.length > 0 ? scopes : undefined,
  );

  if (result.ok) {
    io.stdout(JSON.stringify(result.checked, null, 2));
    return 0;
  }

  io.stderr(result.errors.join('\n'));
  return 1;
}

async function runList(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const collection = parseCollection(args.shift() ?? '');
  const ids =
    collection === 'issue'
      ? await listIssueIds(globals.dataDir)
      : await listEntityIds(globals.dataDir, collection);
  io.stdout(ids.join('\n'));
  return 0;
}

async function runShow(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const collection = parseCollection(args.shift() ?? '');
  const id = args.shift();
  if (!id) {
    throw new Error('show requires an id');
  }

  const value =
    collection === 'issue'
      ? await readIssueBundle(globals.dataDir, id)
      : await readEntity(globals.dataDir, collection, id);
  io.stdout(JSON.stringify(value, null, 2));
  return 0;
}

async function runSchematicMap(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const action = args.shift();

  if (action === 'list') {
    const kind = args.shift();
    const values =
      kind === 'constraint'
        ? await listSchematicMapConstraintSetEffectiveDates(globals.dataDir)
        : kind === 'version'
          ? await listSchematicMapVersionSnapshotEffectiveDates(globals.dataDir)
          : undefined;

    if (!values) {
      throw new Error('schematic-map list requires constraint or version');
    }

    io.stdout(values.join('\n'));
    return 0;
  }

  if (action === 'show') {
    const kind = args.shift();
    const id = args.shift();
    const value =
      kind === 'manifest'
        ? await readSchematicMapManifest(globals.dataDir)
        : kind === 'rules'
          ? await readSchematicMapRuleSet(
              globals.dataDir,
              id ? SchematicMapLayoutEngineIdSchema.parse(id) : undefined,
            )
          : kind === 'constraint' && id
            ? await readSchematicMapConstraintSet(
                globals.dataDir,
                SchematicMapEffectiveDateSchema.parse(id),
              )
            : kind === 'version' && id
              ? await readSchematicMapVersionSnapshot(
                  globals.dataDir,
                  SchematicMapEffectiveDateSchema.parse(id),
                )
              : undefined;

    if (!value) {
      throw new Error(
        'schematic-map show requires manifest, rules, constraint <YYYY-MM>, or version <YYYY-MM>',
      );
    }

    io.stdout(JSON.stringify(value, null, 2));
    return 0;
  }

  if (action === 'select') {
    const at = args.shift();
    if (!at) {
      throw new Error('schematic-map select requires YYYY-MM or YYYY-MM-DD');
    }

    const manifest = await readSchematicMapManifest(globals.dataDir);
    const version = selectSchematicMapVersion(manifest.value.versions, at);
    if (!version) {
      throw new Error(`No schematic map version effective at ${at}`);
    }

    io.stdout(JSON.stringify(version, null, 2));
    return 0;
  }

  if (action === 'stats') {
    const id = args.shift();
    if (!id) {
      throw new Error('schematic-map stats requires YYYY-MM');
    }

    const effectiveDate = SchematicMapEffectiveDateSchema.parse(id);
    const [snapshot, constraintEffectiveDates] = await Promise.all([
      readSchematicMapVersionSnapshot(globals.dataDir, effectiveDate),
      listSchematicMapConstraintSetEffectiveDates(globals.dataDir),
    ]);
    const constraintSet = constraintEffectiveDates.includes(effectiveDate)
      ? await readSchematicMapConstraintSet(globals.dataDir, effectiveDate)
      : undefined;
    const coordinateClasses = countSchematicMapSnapshotCoordinates(
      snapshot.value,
    );
    const constraintTypes = countConstraintTypes(
      constraintSet?.value.constraints ?? [],
    );

    io.stdout(
      JSON.stringify(
        {
          effectiveDate,
          coordinates: {
            total: Object.values(coordinateClasses).reduce(
              (sum, value) => sum + value,
              0,
            ),
            byClass: coordinateClasses,
          },
          constraints: {
            total: constraintSet?.value.constraints.length ?? 0,
            byType: constraintTypes,
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (action === 'generate') {
    const id = args.shift();
    if (!id) {
      throw new Error('schematic-map generate requires YYYY-MM');
    }

    const generatedAt = readOption(args, '--generated-at');
    const shouldWrite = hasFlag(args, '--write');
    const snapshot = await generateSchematicMapVersionSnapshot(
      globals.dataDir,
      {
        effectiveDate: SchematicMapEffectiveDateSchema.parse(id),
        generatedAt,
      },
    );

    if (shouldWrite) {
      const snapshotPath = await writeSchematicMapVersionSnapshot(
        globals.dataDir,
        snapshot,
      );
      const manifestPath = await updateSchematicMapManifest(
        globals.dataDir,
        snapshot,
      );
      io.stdout(
        JSON.stringify({ snapshot: snapshotPath, manifest: manifestPath }),
      );
      return 0;
    }

    io.stdout(JSON.stringify(snapshot, null, 2));
    return 0;
  }

  if (action === 'preview') {
    const id = args.shift();
    if (!id) {
      throw new Error('schematic-map preview requires YYYY-MM');
    }

    const out = readOption(args, '--out');
    const snapshot = await readSchematicMapVersionSnapshot(
      globals.dataDir,
      SchematicMapEffectiveDateSchema.parse(id),
    );
    const svg = await renderSchematicMapPreviewSvg(
      globals.dataDir,
      snapshot.value,
    );

    if (out) {
      const outPath = resolve(globals.cwd, out);
      await writeTextFile(outPath, svg);
      io.stdout(outPath);
      return 0;
    }

    io.stdout(svg.trimEnd());
    return 0;
  }

  throw new Error(
    'schematic-map requires list, show, select, stats, generate, or preview',
  );
}

async function runCreate(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const entity = args.shift();
  if (entity === 'issue') {
    const date = readOption(args, '--date', { required: true }) as string;
    const title = readOption(args, '--title', { required: true }) as string;
    const slug = readOption(args, '--slug');
    const source = readOption(args, '--source') ?? 'cli';
    const type = IssueTypeSchema.parse(
      readOption(args, '--type') ?? 'disruption',
    );
    const id = buildIssueId(date, slug ?? title);
    const bundle = await createIssueBundle(globals.dataDir, {
      id,
      title,
      titleSource: source,
      type,
    });
    io.stdout(bundle.path);
    return 0;
  }

  const collection = parseCollection(entity ?? '');
  if (collection === 'issue') {
    throw new Error('Issue records must be created with create issue');
  }
  const file = readOption(args, '--file', { required: true }) as string;
  const json: unknown = JSON.parse(
    await readFile(resolve(globals.cwd, file), 'utf8'),
  );
  io.stdout(await writeUnknownEntity(globals.dataDir, collection, json));
  return 0;
}

async function runId(args: string[], io: CliIO): Promise<number> {
  const kind = args.shift();
  if (kind !== 'issue') {
    throw new Error('Only id issue is supported');
  }
  const date = readOption(args, '--date', { required: true }) as string;
  const title = readOption(args, '--title', { required: true }) as string;
  io.stdout(buildIssueId(date, title));
  return 0;
}

async function runManifest(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const shouldWrite = hasFlag(args, '--write');
  const manifest = await buildManifest(globals.dataDir);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (shouldWrite) {
    await writeTextFile(join(globals.dataDir, 'manifest.json'), json);
    io.stdout('manifest.json');
    return 0;
  }

  io.stdout(json.trimEnd());
  return 0;
}

async function runPagesIndex(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const shouldWrite = hasFlag(args, '--write');
  const html = renderPagesIndex(await buildManifest(globals.dataDir));

  if (shouldWrite) {
    await writeTextFile(join(globals.dataDir, 'index.html'), html);
    io.stdout('index.html');
    return 0;
  }

  io.stdout(html.trimEnd());
  return 0;
}

export async function runCli(
  argv: readonly string[],
  io: CliIO = defaultIo,
  cwd = process.cwd(),
): Promise<number> {
  try {
    const { command, globals } = parseArgs(argv, cwd);
    const verb = command.shift();

    switch (verb) {
      case 'validate':
        return await runValidate(command, globals, io);
      case 'list':
        return await runList(command, globals, io);
      case 'show':
        return await runShow(command, globals, io);
      case 'schematic-map':
        return await runSchematicMap(command, globals, io);
      case 'create':
        return await runCreate(command, globals, io);
      case 'id':
        return await runId(command, io);
      case 'manifest':
        return await runManifest(command, globals, io);
      case 'pages-index':
        return await runPagesIndex(command, globals, io);
      case '--help':
      case '-h':
      case undefined:
        io.stdout(usage.trimEnd());
        return 0;
      default:
        throw new Error(`Unknown command: ${verb}`);
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2));
}
