import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, resolve } from 'node:path';
import {
  type SchematicMapConstraint,
  type SchematicMapConstraintSet,
  type SchematicMapCoordinateMetadata,
  SchematicMapEffectiveDateSchema,
  SchematicMapLayoutEngineIdSchema,
  type SchematicMapManifest,
  type SchematicMapManifestVersion,
  type SchematicMapRuleSet,
  type SchematicMapVersionSnapshot,
} from '@mrtdown/core';
import {
  generateSchematicMapVersionSnapshot,
  listEntities,
  listSchematicMapConstraintSetEffectiveDates,
  listSchematicMapVersionSnapshotEffectiveDates,
  readEntity,
  readSchematicMapConstraintSet,
  readSchematicMapManifest,
  readSchematicMapRuleSet,
  readSchematicMapVersionSnapshot,
  schematicSystemMapConstraintSetPath,
  validateDataRoot,
  writeSchematicMapConstraintSet,
  writeSchematicMapManifest,
  writeSchematicMapVersionSnapshot,
} from '@mrtdown/fs';
import type { Element, ElementContent, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { hasFlag, readOption } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';
import { writeTextFile } from './manifest.js';

function effectiveDateFromDate(value: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return value;
  }

  const dateMatch = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/.exec(value);
  if (dateMatch) {
    const [, yearText, monthText, dayText] = dateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return value.slice(0, 7);
    }
  }

  throw new Error(`Expected YYYY-MM or YYYY-MM-DD, got: ${value}`);
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

type IdDiff = {
  added: string[];
  removed: string[];
};

type SchematicMapSemanticDiff = {
  from: string;
  to: string;
  frame: {
    changed: boolean;
  };
  layers: {
    changed: boolean;
    from: string[];
    to: string[];
  };
  lineGroups: IdDiff & {
    changed: string[];
  };
  stations: IdDiff & {
    idChanged: string[];
    moved: string[];
    lineMembershipChanged: string[];
    partsChanged: string[];
    metadataChanged: string[];
  };
  segments: IdDiff & {
    geometryChanged: string[];
    geometryMetadataChanged: string[];
    topologyChanged: string[];
    metadataChanged: string[];
  };
  labels: IdDiff & {
    moved: string[];
    sideChanged: string[];
    stationChanged: string[];
    leaderLineChanged: string[];
    metadataChanged: string[];
  };
  stationCodeLabels: IdDiff & {
    moved: string[];
    sideChanged: string[];
    stationChanged: string[];
    metadataChanged: string[];
  };
  coordinates: {
    from: CoordinateClassCounts;
    to: CoordinateClassCounts;
    delta: CoordinateClassCounts;
  };
};

type SchematicMapGeneratorDiff = {
  from: string;
  to: string;
  layoutEngine: {
    changed: boolean;
    from: string;
    to: string;
  };
  rules: {
    changed: boolean;
    lineOrderChanged: boolean;
    fromLineOrder: string[];
    toLineOrder: string[];
  };
  constraints: IdDiff & {
    changed: string[];
    byType: {
      from: ConstraintTypeCounts;
      to: ConstraintTypeCounts;
      delta: ConstraintTypeCounts;
    };
  };
};

type SchematicMapDesignerSubmissionBundle = {
  schemaVersion: 1;
  type: 'schematic-map-designer-submission';
  mapId: 'system';
  sourceEffectiveDate: string;
  targetEffectiveDate: string;
  layoutEngineId: string;
  source: {
    tool: string;
    url?: string;
  };
  summary: string;
  files: {
    constraint: string;
    semanticDiff?: string;
    generatorDiff?: string;
    preview?: string;
  };
  notes?: string[];
};

type SchematicMapReferenceInventory = {
  generatedAt: string;
  sourceRepositoryPath: string;
  mapComponentDir: string;
  maps: SchematicMapReferenceInventoryMap[];
  firstTarget?: SchematicMapReferenceInventoryMap;
};

type SchematicMapReferenceInventoryMap = {
  effectiveDate: string;
  componentName: string;
  sourcePath: string;
  viewBox: string | null;
  rootGroupId: string | null;
  lineCount: number;
  counts: {
    ids: number;
    uniqueIds: number;
    duplicateIds: number;
    tags: Record<string, number>;
    lineGroups: number;
    lineSegments: number;
    stationLabels: number;
    stationNodes: number;
    stationCodes: number;
    stationIds: number;
    rawPathGeometry: number;
    textElementsWithIds: number;
  };
  layerOrder: string[];
  lineGroupIds: string[];
  lineSegmentIds: string[];
  stationLabelIds: string[];
  stationNodeIds: string[];
  stationCodeIds: string[];
  stationIds: string[];
  rawGeometryIds: string[];
};

type StationCodeLabelMatcher = {
  codes: ReadonlySet<string>;
  prefixes: ReadonlySet<string>;
};

const schematicMapMonthByName = new Map([
  ['Jan', '01'],
  ['Feb', '02'],
  ['Mar', '03'],
  ['Apr', '04'],
  ['May', '05'],
  ['Jun', '06'],
  ['Jul', '07'],
  ['Aug', '08'],
  ['Sep', '09'],
  ['Oct', '10'],
  ['Nov', '11'],
  ['Dec', '12'],
]);
const schematicMapComponentDirParts = [
  'app',
  'components',
  'StationMap',
  'components',
];
const schematicMapComponentDir = posix.join(...schematicMapComponentDirParts);

function effectiveDateIdPart(effectiveDate: string): string {
  return effectiveDate.replace('-', '_');
}

function componentEffectiveDate(componentName: string): string {
  const match = /^Map([A-Z][a-z]{2})(\d{4})$/.exec(componentName);
  if (!match) {
    throw new Error(`Cannot derive effective date from ${componentName}`);
  }

  const [, monthName, year] = match;
  const month = schematicMapMonthByName.get(monthName);
  if (!month) {
    throw new Error(`Unknown map month in ${componentName}`);
  }

  return `${year}-${month}`;
}

function parseTsxAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g,
  )) {
    const [, name, doubleQuoted, singleQuoted, expression] = match;
    attrs[name] = doubleQuoted ?? singleQuoted ?? expression ?? '';
  }
  return attrs;
}

function findRootGroup(
  stack: Array<{ tagName: string; id?: string }>,
): { tagName: string; id?: string } | undefined {
  return stack.find((entry) => entry.id?.startsWith('System Map '));
}

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeInventoryPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function lineSegmentStations(id: string): string[] {
  const match = /^line_([a-z0-9]+):([a-z0-9]+)$/.exec(id);
  if (!match) {
    return [];
  }
  return [match[1].toUpperCase(), match[2].toUpperCase()];
}

function normalizeStationCodeLabelId(id: string): string {
  return id.replaceAll(/\s+/g, '');
}

function stationCodeLabelMatches(
  id: string,
  matcher: StationCodeLabelMatcher,
): boolean {
  if (matcher.codes.has(normalizeStationCodeLabelId(id))) {
    return true;
  }

  const prefix = /^([A-Z]+)\s+\d/.exec(id)?.[1];
  return matcher.prefixes.has(prefix ?? '');
}

async function stationCodeLabelMatcher(
  dataDir: string,
): Promise<StationCodeLabelMatcher> {
  const stationRecords = await listEntities(dataDir, 'station');
  const codes = new Set<string>();
  const prefixes = new Set<string>();

  for (const station of stationRecords) {
    for (const stationCode of station.value.stationCodes) {
      codes.add(stationCode.code);
      const prefix = /^([A-Z]+)/.exec(stationCode.code)?.[1];
      if (prefix) {
        prefixes.add(prefix);
      }
    }
  }

  return { codes, prefixes };
}

function summarizeMapTsxTags(
  source: string,
  stationCodeMatcher: StationCodeLabelMatcher,
): Omit<
  SchematicMapReferenceInventoryMap,
  | 'componentName'
  | 'effectiveDate'
  | 'sourcePath'
  | 'viewBox'
  | 'rootGroupId'
  | 'lineCount'
> {
  const stack: Array<{ tagName: string; id?: string }> = [];
  const ids: string[] = [];
  const tagCounts = new Map<string, number>();
  const layerOrder: string[] = [];
  const lineSegmentIds: string[] = [];
  const lineGroupIds: string[] = [];
  const stationLabelIds: string[] = [];
  const stationNodeIds: string[] = [];
  const stationCodeIds: string[] = [];
  const stationIds: string[] = [];
  const rawGeometryIds: string[] = [];
  const textIds: string[] = [];
  let rootGroupDepth: number | undefined;

  const tagPattern = /<\/?([A-Za-z][\w:.]*)\b([^<>]*?)(\/?)>/gs;
  for (const match of source.matchAll(tagPattern)) {
    const [tagSource, tagName, attrSource, selfClosing] = match;
    if (tagName === 'SVGSVGElement') {
      continue;
    }

    if (tagSource.startsWith('</')) {
      while (stack.length > 0) {
        const popped = stack.pop();
        if (popped?.tagName === tagName) {
          break;
        }
      }
      continue;
    }

    const attrs = parseTsxAttributes(attrSource);
    const id = attrs.id;
    const rootGroup = findRootGroup(stack);
    tagCounts.set(tagName, (tagCounts.get(tagName) ?? 0) + 1);

    if (id) {
      ids.push(id);

      if (id.startsWith('line_')) {
        if (tagName === 'g') {
          lineGroupIds.push(id);
        } else {
          const segmentStationIds = lineSegmentStations(id);
          if (segmentStationIds.length > 0) {
            lineSegmentIds.push(id);
            stationIds.push(...segmentStationIds);
          }
        }
      } else if (id.startsWith('label_')) {
        stationLabelIds.push(id);
        stationIds.push(id.slice('label_'.length).toUpperCase());
      } else if (id.startsWith('node_')) {
        stationNodeIds.push(id);
        stationIds.push(id.slice('node_'.length).toUpperCase());
      } else if (stationCodeLabelMatches(id, stationCodeMatcher)) {
        stationCodeIds.push(id);
      }

      if (tagName === 'path' && attrs.d) {
        rawGeometryIds.push(id);
      }

      if (tagName === 'text') {
        textIds.push(id);
      }

      if (rootGroup && stack.length === rootGroupDepth) {
        layerOrder.push(id);
      }
    }

    if (id?.startsWith('System Map ')) {
      rootGroupDepth = stack.length + 1;
    }

    if (!selfClosing && !tagSource.endsWith('/>')) {
      stack.push({ tagName, id });
    }
  }

  return {
    counts: {
      ids: ids.length,
      uniqueIds: new Set(ids).size,
      duplicateIds: ids.length - new Set(ids).size,
      tags: Object.fromEntries([...tagCounts.entries()].sort()),
      lineGroups: new Set(lineGroupIds).size,
      lineSegments: new Set(lineSegmentIds).size,
      stationLabels: new Set(stationLabelIds).size,
      stationNodes: new Set(stationNodeIds).size,
      stationCodes: new Set(stationCodeIds).size,
      stationIds: new Set(stationIds).size,
      rawPathGeometry: new Set(rawGeometryIds).size,
      textElementsWithIds: new Set(textIds).size,
    },
    layerOrder,
    lineGroupIds: sortUnique(lineGroupIds),
    lineSegmentIds: sortUnique(lineSegmentIds),
    stationLabelIds: sortUnique(stationLabelIds),
    stationNodeIds: sortUnique(stationNodeIds),
    stationCodeIds: sortUnique(stationCodeIds),
    stationIds: sortUnique(stationIds),
    rawGeometryIds: sortUnique(rawGeometryIds),
  };
}

async function readMapTsxFile(
  path: string,
  siteDir: string,
  stationCodeMatcher: StationCodeLabelMatcher,
): Promise<SchematicMapReferenceInventoryMap> {
  const source = await readFile(path, 'utf8');
  const componentName = path.match(/(Map[A-Za-z0-9]+)\.tsx$/)?.[1];
  if (!componentName) {
    throw new Error(`Cannot derive component name from ${path}`);
  }

  return {
    effectiveDate: componentEffectiveDate(componentName),
    componentName,
    sourcePath: normalizeInventoryPath(relative(siteDir, path)),
    viewBox: source.match(/viewBox="([^"]+)"/)?.[1] ?? null,
    rootGroupId: source.match(/<g\s+id="(System Map \([^)]+\))"/)?.[1] ?? null,
    lineCount: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
    ...summarizeMapTsxTags(source, stationCodeMatcher),
  };
}

async function buildSchematicMapReferenceInventory(
  cwd: string,
  dataDir: string,
  siteDir: string,
): Promise<SchematicMapReferenceInventory> {
  const mapDir = join(siteDir, ...schematicMapComponentDirParts);
  const [entries, codeMatcher] = await Promise.all([
    readdir(mapDir, { withFileTypes: true }),
    stationCodeLabelMatcher(dataDir),
  ]);
  const files = entries
    .filter((entry) => /^Map[A-Za-z0-9]+\.tsx$/.test(entry.name))
    .map((entry) => join(mapDir, entry.name));
  const maps = await Promise.all(
    files.map((file) => readMapTsxFile(file, siteDir, codeMatcher)),
  );
  maps.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  return {
    generatedAt: new Date(0).toISOString(),
    sourceRepositoryPath: normalizeInventoryPath(relative(cwd, siteDir)) || '.',
    mapComponentDir: schematicMapComponentDir,
    maps,
    firstTarget: maps.find((map) => map.effectiveDate === '2025-04'),
  };
}

function copyConstraintIdForEffectiveDate(
  id: string,
  fromEffectiveDate: string,
  toEffectiveDate: string,
): string {
  return id
    .replaceAll(fromEffectiveDate, toEffectiveDate)
    .replaceAll(
      effectiveDateIdPart(fromEffectiveDate),
      effectiveDateIdPart(toEffectiveDate),
    );
}

function copySchematicMapConstraintSet(
  constraintSet: SchematicMapConstraintSet,
  toEffectiveDate: string,
): SchematicMapConstraintSet {
  return {
    ...constraintSet,
    effectiveDate: SchematicMapEffectiveDateSchema.parse(toEffectiveDate),
    constraints: constraintSet.constraints.map((constraint) => ({
      ...constraint,
      id: copyConstraintIdForEffectiveDate(
        constraint.id,
        constraintSet.effectiveDate,
        toEffectiveDate,
      ),
    })),
  };
}

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

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path}.${key} must be a non-empty string when present`);
  }
  return value;
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error(`${path}.${key} must be an array of non-empty strings`);
  }
  return value;
}

function parseSchematicMapDesignerSubmissionBundle(
  value: unknown,
): SchematicMapDesignerSubmissionBundle {
  const root = assertRecord(value, 'submission');
  if (root.schemaVersion !== 1) {
    throw new Error('submission.schemaVersion must be 1');
  }
  if (root.type !== 'schematic-map-designer-submission') {
    throw new Error(
      'submission.type must be schematic-map-designer-submission',
    );
  }
  if (root.mapId !== 'system') {
    throw new Error('submission.mapId must be system');
  }

  const source = assertRecord(root.source, 'submission.source');
  const files = assertRecord(root.files, 'submission.files');
  const sourceEffectiveDate = SchematicMapEffectiveDateSchema.parse(
    requiredString(root, 'sourceEffectiveDate', 'submission'),
  );
  const targetEffectiveDate = SchematicMapEffectiveDateSchema.parse(
    requiredString(root, 'targetEffectiveDate', 'submission'),
  );
  const layoutEngineId = SchematicMapLayoutEngineIdSchema.parse(
    requiredString(root, 'layoutEngineId', 'submission'),
  );

  if (sourceEffectiveDate === targetEffectiveDate) {
    throw new Error(
      'submission.sourceEffectiveDate and submission.targetEffectiveDate must differ',
    );
  }

  return {
    schemaVersion: 1,
    type: 'schematic-map-designer-submission',
    mapId: 'system',
    sourceEffectiveDate,
    targetEffectiveDate,
    layoutEngineId,
    source: {
      tool: requiredString(source, 'tool', 'submission.source'),
      url: optionalString(source, 'url', 'submission.source'),
    },
    summary: requiredString(root, 'summary', 'submission'),
    files: {
      constraint: requiredString(files, 'constraint', 'submission.files'),
      semanticDiff: optionalString(files, 'semanticDiff', 'submission.files'),
      generatorDiff: optionalString(files, 'generatorDiff', 'submission.files'),
      preview: optionalString(files, 'preview', 'submission.files'),
    },
    notes: optionalStringArray(root, 'notes', 'submission'),
  };
}

function constraintTypeDelta(
  from: ConstraintTypeCounts,
  to: ConstraintTypeCounts,
): ConstraintTypeCounts {
  return {
    interchange_hint: to.interchange_hint - from.interchange_hint,
    label_hint: to.label_hint - from.label_hint,
    line_order: to.line_order - from.line_order,
    map_frame: to.map_frame - from.map_frame,
    segment_route_hint: to.segment_route_hint - from.segment_route_hint,
    station_anchor: to.station_anchor - from.station_anchor,
  };
}

function effectiveLineOrderFromInputs(
  ruleSet: SchematicMapRuleSet,
  constraintSet: SchematicMapConstraintSet,
): string[] {
  let lineOrder: string[] | undefined;

  for (const constraint of constraintSet.constraints) {
    if (constraint.type === 'line_order') {
      lineOrder = constraint.lineIds;
    }
  }

  return lineOrder ?? ruleSet.lineOrder;
}

function mapById<T extends { id: string }>(
  items: readonly T[],
): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function sortedIds(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function diffIds(
  fromIds: Iterable<string>,
  toIds: Iterable<string>,
): IdDiff & { shared: string[] } {
  const fromSet = new Set(fromIds);
  const toSet = new Set(toIds);

  return {
    added: sortedIds([...toSet].filter((id) => !fromSet.has(id))),
    removed: sortedIds([...fromSet].filter((id) => !toSet.has(id))),
    shared: sortedIds([...fromSet].filter((id) => toSet.has(id))),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function samePoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  return from.x === to.x && from.y === to.y;
}

function coordinateClassDelta(
  from: CoordinateClassCounts,
  to: CoordinateClassCounts,
): CoordinateClassCounts {
  return {
    artifact: to.artifact - from.artifact,
    constraint: to.constraint - from.constraint,
    exception: to.exception - from.exception,
    generated: to.generated - from.generated,
  };
}

function visibleSegmentGeometry(
  geometry: SchematicMapVersionSnapshot['segments'][number]['geometry'],
): unknown {
  if (geometry.type === 'polyline') {
    return {
      type: geometry.type,
      points: geometry.points,
    };
  }

  return {
    type: geometry.type,
    start: geometry.start,
    control1: geometry.control1,
    control2: geometry.control2,
    end: geometry.end,
  };
}

function diffSchematicMapSnapshots(
  from: SchematicMapVersionSnapshot,
  to: SchematicMapVersionSnapshot,
): SchematicMapSemanticDiff {
  const fromLineGroups = mapById(from.lineGroups);
  const toLineGroups = mapById(to.lineGroups);
  const lineGroupIds = diffIds(fromLineGroups.keys(), toLineGroups.keys());

  const fromStations = new Map(
    from.stationNodes.map((node) => [node.stationId, node]),
  );
  const toStations = new Map(
    to.stationNodes.map((node) => [node.stationId, node]),
  );
  const stationIds = diffIds(fromStations.keys(), toStations.keys());

  const fromSegments = mapById(from.segments);
  const toSegments = mapById(to.segments);
  const segmentIds = diffIds(fromSegments.keys(), toSegments.keys());

  const fromLabels = mapById(from.labels);
  const toLabels = mapById(to.labels);
  const labelIds = diffIds(fromLabels.keys(), toLabels.keys());

  const fromStationCodeLabels = mapById(from.stationCodeLabels);
  const toStationCodeLabels = mapById(to.stationCodeLabels);
  const stationCodeLabelIds = diffIds(
    fromStationCodeLabels.keys(),
    toStationCodeLabels.keys(),
  );

  const fromCoordinateCounts = countSchematicMapSnapshotCoordinates(from);
  const toCoordinateCounts = countSchematicMapSnapshotCoordinates(to);

  return {
    from: from.effectiveDate,
    to: to.effectiveDate,
    frame: {
      changed: stableJson(from.frame) !== stableJson(to.frame),
    },
    layers: {
      changed: stableJson(from.layers) !== stableJson(to.layers),
      from: from.layers.map((layer) => layer.id),
      to: to.layers.map((layer) => layer.id),
    },
    lineGroups: {
      added: lineGroupIds.added,
      removed: lineGroupIds.removed,
      changed: lineGroupIds.shared.filter(
        (id) =>
          stableJson(fromLineGroups.get(id)) !==
          stableJson(toLineGroups.get(id)),
      ),
    },
    stations: {
      added: stationIds.added,
      removed: stationIds.removed,
      idChanged: stationIds.shared.filter(
        (stationId) =>
          fromStations.get(stationId)?.id !== toStations.get(stationId)?.id,
      ),
      moved: stationIds.shared.filter((stationId) => {
        const fromNode = fromStations.get(stationId);
        const toNode = toStations.get(stationId);
        return Boolean(
          fromNode && toNode && !samePoint(fromNode.center, toNode.center),
        );
      }),
      lineMembershipChanged: stationIds.shared.filter((stationId) => {
        const fromNode = fromStations.get(stationId);
        const toNode = toStations.get(stationId);
        return (
          Boolean(fromNode && toNode) &&
          stableJson(fromNode?.lineIds) !== stableJson(toNode?.lineIds)
        );
      }),
      partsChanged: stationIds.shared.filter((stationId) => {
        const fromNode = fromStations.get(stationId);
        const toNode = toStations.get(stationId);
        return (
          Boolean(fromNode && toNode) &&
          stableJson(fromNode?.parts) !== stableJson(toNode?.parts)
        );
      }),
      metadataChanged: stationIds.shared.filter((stationId) => {
        const fromNode = fromStations.get(stationId);
        const toNode = toStations.get(stationId);
        return (
          Boolean(fromNode && toNode) &&
          stableJson({
            displayStatus: fromNode?.displayStatus,
            displayReason: fromNode?.displayReason,
            layerId: fromNode?.layerId,
            coordinateMetadata: fromNode?.coordinateMetadata,
          }) !==
            stableJson({
              displayStatus: toNode?.displayStatus,
              displayReason: toNode?.displayReason,
              layerId: toNode?.layerId,
              coordinateMetadata: toNode?.coordinateMetadata,
            })
        );
      }),
    },
    segments: {
      added: segmentIds.added,
      removed: segmentIds.removed,
      geometryChanged: segmentIds.shared.filter((id) => {
        const fromSegment = fromSegments.get(id);
        const toSegment = toSegments.get(id);
        return (
          Boolean(fromSegment && toSegment) &&
          stableJson(
            fromSegment
              ? visibleSegmentGeometry(fromSegment.geometry)
              : undefined,
          ) !==
            stableJson(
              toSegment
                ? visibleSegmentGeometry(toSegment.geometry)
                : undefined,
            )
        );
      }),
      geometryMetadataChanged: segmentIds.shared.filter(
        (id) =>
          stableJson(fromSegments.get(id)?.geometry.coordinateMetadata) !==
          stableJson(toSegments.get(id)?.geometry.coordinateMetadata),
      ),
      topologyChanged: segmentIds.shared.filter((id) => {
        const fromSegment = fromSegments.get(id);
        const toSegment = toSegments.get(id);
        return (
          Boolean(fromSegment && toSegment) &&
          stableJson(fromSegment?.topology) !== stableJson(toSegment?.topology)
        );
      }),
      metadataChanged: segmentIds.shared.filter((id) => {
        const fromSegment = fromSegments.get(id);
        const toSegment = toSegments.get(id);
        return (
          Boolean(fromSegment && toSegment) &&
          stableJson({
            lineId: fromSegment?.lineId,
            displayStatus: fromSegment?.displayStatus,
            displayReason: fromSegment?.displayReason,
            layerId: fromSegment?.layerId,
          }) !==
            stableJson({
              lineId: toSegment?.lineId,
              displayStatus: toSegment?.displayStatus,
              displayReason: toSegment?.displayReason,
              layerId: toSegment?.layerId,
            })
        );
      }),
    },
    labels: {
      added: labelIds.added,
      removed: labelIds.removed,
      moved: labelIds.shared.filter((id) => {
        const fromLabel = fromLabels.get(id);
        const toLabel = toLabels.get(id);
        return Boolean(
          fromLabel && toLabel && !samePoint(fromLabel.anchor, toLabel.anchor),
        );
      }),
      sideChanged: labelIds.shared.filter(
        (id) => fromLabels.get(id)?.side !== toLabels.get(id)?.side,
      ),
      stationChanged: labelIds.shared.filter(
        (id) => fromLabels.get(id)?.stationId !== toLabels.get(id)?.stationId,
      ),
      leaderLineChanged: labelIds.shared.filter(
        (id) =>
          stableJson(fromLabels.get(id)?.leaderLine) !==
          stableJson(toLabels.get(id)?.leaderLine),
      ),
      metadataChanged: labelIds.shared.filter((id) => {
        const fromLabel = fromLabels.get(id);
        const toLabel = toLabels.get(id);
        return (
          Boolean(fromLabel && toLabel) &&
          stableJson({
            displayStatus: fromLabel?.displayStatus,
            displayReason: fromLabel?.displayReason,
            layerId: fromLabel?.layerId,
            rotationDegrees: fromLabel?.rotationDegrees,
            coordinateMetadata: fromLabel?.coordinateMetadata,
          }) !==
            stableJson({
              displayStatus: toLabel?.displayStatus,
              displayReason: toLabel?.displayReason,
              layerId: toLabel?.layerId,
              rotationDegrees: toLabel?.rotationDegrees,
              coordinateMetadata: toLabel?.coordinateMetadata,
            })
        );
      }),
    },
    stationCodeLabels: {
      added: stationCodeLabelIds.added,
      removed: stationCodeLabelIds.removed,
      moved: stationCodeLabelIds.shared.filter((id) => {
        const fromLabel = fromStationCodeLabels.get(id);
        const toLabel = toStationCodeLabels.get(id);
        return Boolean(
          fromLabel && toLabel && !samePoint(fromLabel.anchor, toLabel.anchor),
        );
      }),
      sideChanged: stationCodeLabelIds.shared.filter(
        (id) =>
          fromStationCodeLabels.get(id)?.side !==
          toStationCodeLabels.get(id)?.side,
      ),
      stationChanged: stationCodeLabelIds.shared.filter((id) => {
        const fromLabel = fromStationCodeLabels.get(id);
        const toLabel = toStationCodeLabels.get(id);
        return (
          fromLabel?.stationId !== toLabel?.stationId ||
          fromLabel?.lineId !== toLabel?.lineId
        );
      }),
      metadataChanged: stationCodeLabelIds.shared.filter((id) => {
        const fromLabel = fromStationCodeLabels.get(id);
        const toLabel = toStationCodeLabels.get(id);
        return (
          Boolean(fromLabel && toLabel) &&
          stableJson({
            displayStatus: fromLabel?.displayStatus,
            displayReason: fromLabel?.displayReason,
            layerId: fromLabel?.layerId,
            rotationDegrees: fromLabel?.rotationDegrees,
            coordinateMetadata: fromLabel?.coordinateMetadata,
          }) !==
            stableJson({
              displayStatus: toLabel?.displayStatus,
              displayReason: toLabel?.displayReason,
              layerId: toLabel?.layerId,
              rotationDegrees: toLabel?.rotationDegrees,
              coordinateMetadata: toLabel?.coordinateMetadata,
            })
        );
      }),
    },
    coordinates: {
      from: fromCoordinateCounts,
      to: toCoordinateCounts,
      delta: coordinateClassDelta(fromCoordinateCounts, toCoordinateCounts),
    },
  };
}

function diffSchematicMapGeneratorInputs(
  fromConstraintSet: SchematicMapConstraintSet,
  toConstraintSet: SchematicMapConstraintSet,
  fromRuleSet: SchematicMapRuleSet,
  toRuleSet: SchematicMapRuleSet,
): SchematicMapGeneratorDiff {
  const fromConstraints = mapById(fromConstraintSet.constraints);
  const toConstraints = mapById(toConstraintSet.constraints);
  const constraintIds = diffIds(fromConstraints.keys(), toConstraints.keys());
  const fromConstraintTypeCounts = countConstraintTypes(
    fromConstraintSet.constraints,
  );
  const toConstraintTypeCounts = countConstraintTypes(
    toConstraintSet.constraints,
  );
  const fromLineOrder = effectiveLineOrderFromInputs(
    fromRuleSet,
    fromConstraintSet,
  );
  const toLineOrder = effectiveLineOrderFromInputs(toRuleSet, toConstraintSet);

  return {
    from: fromConstraintSet.effectiveDate,
    to: toConstraintSet.effectiveDate,
    layoutEngine: {
      changed:
        fromConstraintSet.layoutEngineId !== toConstraintSet.layoutEngineId,
      from: fromConstraintSet.layoutEngineId,
      to: toConstraintSet.layoutEngineId,
    },
    rules: {
      changed: stableJson(fromRuleSet) !== stableJson(toRuleSet),
      lineOrderChanged: stableJson(fromLineOrder) !== stableJson(toLineOrder),
      fromLineOrder,
      toLineOrder,
    },
    constraints: {
      added: constraintIds.added,
      removed: constraintIds.removed,
      changed: constraintIds.shared.filter(
        (id) =>
          stableJson(fromConstraints.get(id)) !==
          stableJson(toConstraints.get(id)),
      ),
      byType: {
        from: fromConstraintTypeCounts,
        to: toConstraintTypeCounts,
        delta: constraintTypeDelta(
          fromConstraintTypeCounts,
          toConstraintTypeCounts,
        ),
      },
    },
  };
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

function svgElement(
  tagName: string,
  properties: Element['properties'] = {},
  children: ElementContent[] = [],
): Element {
  return {
    type: 'element',
    tagName,
    properties,
    children,
  };
}

function svgText(value: string): ElementContent {
  return {
    type: 'text',
    value,
  };
}

function svgTitle(value: string): Element {
  return svgElement('title', {}, [svgText(value)]);
}

async function renderSchematicMapPreviewSvg(
  dataDir: string,
  snapshot: SchematicMapVersionSnapshot,
): Promise<string> {
  const stationNames = new Map<string, string>();
  const lineColors = new Map<string, string>();
  await Promise.all([
    ...snapshot.stationNodes.map(async (node) => {
      const station = await readEntity(dataDir, 'station', node.stationId);
      stationNames.set(
        node.stationId,
        station.value.name['en-SG'] ?? node.stationId,
      );
    }),
    ...snapshot.lineGroups.map(async (lineGroup) => {
      const line = await readEntity(dataDir, 'line', lineGroup.lineId);
      lineColors.set(lineGroup.lineId, line.value.color);
    }),
  ]);

  const layerContent = snapshot.layers.map<Element>((layer) => {
    const segments = snapshot.segments
      .filter((segment) => segment.layerId === layer.id)
      .map<Element>((segment) => {
        const color = lineColors.get(segment.lineId) ?? '#555555';
        if (segment.geometry.type === 'polyline') {
          return svgElement(
            'polyline',
            {
              id: segment.id,
              points: renderGeometry(segment.geometry),
              className: ['line-segment'],
              stroke: color,
            },
            [svgTitle(`${segment.lineId} ${segment.id}`)],
          );
        }

        return svgElement(
          'path',
          {
            id: segment.id,
            d: renderGeometry(segment.geometry),
            className: ['line-segment'],
            stroke: color,
          },
          [svgTitle(`${segment.lineId} ${segment.id}`)],
        );
      });

    const nodes = snapshot.stationNodes
      .filter((node) => node.layerId === layer.id)
      .flatMap((node) =>
        node.parts.map((part) => {
          const color = lineColors.get(part.lineId) ?? '#555555';
          const title = `${stationNames.get(node.stationId) ?? node.stationId} (${part.lineId})`;

          if (part.shape.type === 'pill') {
            return svgElement(
              'rect',
              {
                id: part.id,
                x: part.shape.center.x - part.shape.width / 2,
                y: part.shape.center.y - part.shape.height / 2,
                width: part.shape.width,
                height: part.shape.height,
                rx: part.shape.radius,
                className: ['station-node'],
                stroke: color,
              },
              [svgTitle(title)],
            );
          }

          return svgElement(
            'circle',
            {
              id: part.id,
              cx: part.shape.center.x,
              cy: part.shape.center.y,
              r: part.shape.radius,
              className: ['station-node'],
              stroke: color,
            },
            [svgTitle(title)],
          );
        }),
      );

    const labels = snapshot.labels
      .filter((label) => label.layerId === layer.id)
      .map((label) =>
        svgElement(
          'text',
          {
            id: label.id,
            x: label.anchor.x,
            y: label.anchor.y,
            className: ['station-label'],
            textAnchor: textAnchorForSide(label.side),
          },
          [svgText(stationNames.get(label.stationId) ?? label.stationId)],
        ),
      );

    const stationCodeLabels = snapshot.stationCodeLabels
      .filter((label) => label.layerId === layer.id)
      .map((label) =>
        svgElement(
          'text',
          {
            id: label.id,
            x: label.anchor.x,
            y: label.anchor.y,
            className: ['station-code'],
            textAnchor: textAnchorForSide(label.side),
          },
          [svgText(label.id)],
        ),
      );

    return svgElement(
      'g',
      {
        id: layer.id,
        dataRole: layer.role,
      },
      [...segments, ...nodes, ...labels, ...stationCodeLabels],
    );
  });

  const root: Root = {
    type: 'root',
    children: [
      svgElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: `${snapshot.frame.x} ${snapshot.frame.y} ${snapshot.frame.width} ${snapshot.frame.height}`,
          width: snapshot.frame.width,
          height: snapshot.frame.height,
          role: 'img',
          ariaLabel: `MRTDown schematic map preview ${snapshot.effectiveDate}`,
        },
        [
          svgElement('style', {}, [
            svgText(`
  svg { background: #f7f6f2; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .line-segment { fill: none; stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
  .station-node { fill: #ffffff; stroke-width: 4; }
  .station-label { fill: #1f2933; font-size: 20px; font-weight: 650; dominant-baseline: middle; }
  .station-code { fill: #4b5563; font-size: 13px; font-weight: 700; dominant-baseline: middle; }
`),
          ]),
          svgElement('rect', {
            x: snapshot.frame.x,
            y: snapshot.frame.y,
            width: snapshot.frame.width,
            height: snapshot.frame.height,
            fill: '#f7f6f2',
          }),
          ...layerContent,
        ],
      ),
    ],
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n${toHtml(root)}\n`;
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readOrGenerateSchematicMapVersionSnapshot(
  dataDir: string,
  effectiveDate: string,
): Promise<SchematicMapVersionSnapshot> {
  const parsedEffectiveDate =
    SchematicMapEffectiveDateSchema.parse(effectiveDate);

  try {
    return (await readSchematicMapVersionSnapshot(dataDir, parsedEffectiveDate))
      .value;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  try {
    await readSchematicMapConstraintSet(dataDir, parsedEffectiveDate);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    throw new Error(
      `No schematic map version snapshot or constraint set exists for ${parsedEffectiveDate}`,
    );
  }

  return generateSchematicMapVersionSnapshot(dataDir, {
    effectiveDate: parsedEffectiveDate,
    generatedAt: '1970-01-01T00:00:00.000Z',
  });
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

async function validateSchematicMapDesignerSubmission(
  dataDir: string,
  bundlePath: string,
): Promise<unknown> {
  const bundle = parseSchematicMapDesignerSubmissionBundle(
    JSON.parse(await readFile(bundlePath, 'utf8')),
  );
  const expectedConstraintPath = schematicSystemMapConstraintSetPath(
    bundle.targetEffectiveDate,
  );

  if (bundle.files.constraint !== expectedConstraintPath) {
    throw new Error(
      `submission.files.constraint must be ${expectedConstraintPath}`,
    );
  }

  const [sourceConstraintSet, targetConstraintSet] = await Promise.all([
    readSchematicMapConstraintSet(
      dataDir,
      SchematicMapEffectiveDateSchema.parse(bundle.sourceEffectiveDate),
    ),
    readSchematicMapConstraintSet(
      dataDir,
      SchematicMapEffectiveDateSchema.parse(bundle.targetEffectiveDate),
    ),
  ]);

  if (targetConstraintSet.value.layoutEngineId !== bundle.layoutEngineId) {
    throw new Error(
      `submission.layoutEngineId ${bundle.layoutEngineId} does not match target constraint layoutEngineId ${targetConstraintSet.value.layoutEngineId}`,
    );
  }
  if (
    targetConstraintSet.path !== bundle.files.constraint ||
    targetConstraintSet.value.effectiveDate !== bundle.targetEffectiveDate
  ) {
    throw new Error(
      `Target constraint set must be written at ${expectedConstraintPath} for ${bundle.targetEffectiveDate}`,
    );
  }

  const canonicalValidation = await validateDataRoot(dataDir, [
    'schematic-map',
  ]);
  if (!canonicalValidation.ok) {
    throw new Error(
      `Schematic map validation failed:\n${canonicalValidation.errors.join('\n')}`,
    );
  }

  const [sourceRuleSet, targetRuleSet, sourceSnapshot, targetSnapshot] =
    await Promise.all([
      readSchematicMapRuleSet(
        dataDir,
        sourceConstraintSet.value.layoutEngineId,
      ),
      readSchematicMapRuleSet(
        dataDir,
        targetConstraintSet.value.layoutEngineId,
      ),
      generateSchematicMapVersionSnapshot(dataDir, {
        effectiveDate: sourceConstraintSet.value.effectiveDate,
        generatedAt: '1970-01-01T00:00:00.000Z',
      }),
      generateSchematicMapVersionSnapshot(dataDir, {
        effectiveDate: targetConstraintSet.value.effectiveDate,
        generatedAt: '1970-01-01T00:00:00.000Z',
      }),
    ]);
  const coordinateClasses =
    countSchematicMapSnapshotCoordinates(targetSnapshot);

  return {
    type: bundle.type,
    source: bundle.source,
    summary: bundle.summary,
    sourceEffectiveDate: bundle.sourceEffectiveDate,
    targetEffectiveDate: bundle.targetEffectiveDate,
    layoutEngineId: bundle.layoutEngineId,
    files: bundle.files,
    constraints: {
      path: targetConstraintSet.path,
      total: targetConstraintSet.value.constraints.length,
      byType: countConstraintTypes(targetConstraintSet.value.constraints),
    },
    validation: canonicalValidation.checked,
    generatedSnapshot: {
      effectiveDate: targetSnapshot.effectiveDate,
      stations: targetSnapshot.stationNodes.length,
      segments: targetSnapshot.segments.length,
      labels: targetSnapshot.labels.length,
      stationCodeLabels: targetSnapshot.stationCodeLabels.length,
      coordinates: {
        total: Object.values(coordinateClasses).reduce(
          (sum, value) => sum + value,
          0,
        ),
        byClass: coordinateClasses,
      },
    },
    generatorDiff: diffSchematicMapGeneratorInputs(
      sourceConstraintSet.value,
      targetConstraintSet.value,
      sourceRuleSet.value,
      targetRuleSet.value,
    ),
    semanticDiff: diffSchematicMapSnapshots(sourceSnapshot, targetSnapshot),
    notes: bundle.notes ?? [],
  };
}

export async function runSchematicMap(
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

    const [snapshot, constraintEffectiveDates] = await Promise.all([
      readOrGenerateSchematicMapVersionSnapshot(globals.dataDir, id),
      listSchematicMapConstraintSetEffectiveDates(globals.dataDir),
    ]);
    const effectiveDate = SchematicMapEffectiveDateSchema.parse(id);
    const constraintSet = constraintEffectiveDates.includes(effectiveDate)
      ? await readSchematicMapConstraintSet(globals.dataDir, effectiveDate)
      : undefined;
    const coordinateClasses = countSchematicMapSnapshotCoordinates(snapshot);
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

  if (action === 'diff') {
    const fromId = args.shift();
    const toId = args.shift();
    if (!fromId || !toId) {
      throw new Error(
        'schematic-map diff requires from YYYY-MM and to YYYY-MM',
      );
    }

    const [fromSnapshot, toSnapshot] = await Promise.all([
      readOrGenerateSchematicMapVersionSnapshot(globals.dataDir, fromId),
      readOrGenerateSchematicMapVersionSnapshot(globals.dataDir, toId),
    ]);

    io.stdout(
      JSON.stringify(
        diffSchematicMapSnapshots(fromSnapshot, toSnapshot),
        null,
        2,
      ),
    );
    return 0;
  }

  if (action === 'generator-diff') {
    const fromId = args.shift();
    const toId = args.shift();
    if (!fromId || !toId) {
      throw new Error(
        'schematic-map generator-diff requires from YYYY-MM and to YYYY-MM',
      );
    }

    const [fromConstraintSet, toConstraintSet] = await Promise.all([
      readSchematicMapConstraintSet(
        globals.dataDir,
        SchematicMapEffectiveDateSchema.parse(fromId),
      ),
      readSchematicMapConstraintSet(
        globals.dataDir,
        SchematicMapEffectiveDateSchema.parse(toId),
      ),
    ]);
    const [fromRuleSet, toRuleSet] = await Promise.all([
      readSchematicMapRuleSet(
        globals.dataDir,
        fromConstraintSet.value.layoutEngineId,
      ),
      readSchematicMapRuleSet(
        globals.dataDir,
        toConstraintSet.value.layoutEngineId,
      ),
    ]);

    io.stdout(
      JSON.stringify(
        diffSchematicMapGeneratorInputs(
          fromConstraintSet.value,
          toConstraintSet.value,
          fromRuleSet.value,
          toRuleSet.value,
        ),
        null,
        2,
      ),
    );
    return 0;
  }

  if (action === 'copy-constraints') {
    const fromId = args.shift();
    const toId = args.shift();
    if (!fromId || !toId) {
      throw new Error(
        'schematic-map copy-constraints requires from YYYY-MM and to YYYY-MM',
      );
    }

    const fromEffectiveDate = SchematicMapEffectiveDateSchema.parse(fromId);
    const toEffectiveDate = SchematicMapEffectiveDateSchema.parse(toId);
    const shouldWrite = hasFlag(args, '--write');
    const shouldForce = hasFlag(args, '--force');

    const fromConstraintSet = await readSchematicMapConstraintSet(
      globals.dataDir,
      fromEffectiveDate,
    );
    const copiedConstraintSet = copySchematicMapConstraintSet(
      fromConstraintSet.value,
      toEffectiveDate,
    );

    if (shouldWrite) {
      const existingEffectiveDates =
        await listSchematicMapConstraintSetEffectiveDates(globals.dataDir);
      if (existingEffectiveDates.includes(toEffectiveDate) && !shouldForce) {
        throw new Error(
          `Schematic map constraint set already exists for ${toEffectiveDate}; pass --force to overwrite`,
        );
      }

      const path = await writeSchematicMapConstraintSet(
        globals.dataDir,
        copiedConstraintSet,
      );
      io.stdout(JSON.stringify({ constraint: path }));
      return 0;
    }

    io.stdout(JSON.stringify(copiedConstraintSet, null, 2));
    return 0;
  }

  if (action === 'validate-submission') {
    const file = readOption(args, '--file', { required: true });
    if (!file) {
      throw new Error('--file is required');
    }
    const result = await validateSchematicMapDesignerSubmission(
      globals.dataDir,
      resolve(globals.cwd, file),
    );

    io.stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (action === 'inventory') {
    const siteDir = resolve(
      globals.cwd,
      readOption(args, '--site-dir') ?? '../mrtdown-site',
    );
    const write = readOption(args, '--write');
    const inventory = await buildSchematicMapReferenceInventory(
      globals.cwd,
      globals.dataDir,
      siteDir,
    );
    const json = `${JSON.stringify(inventory, null, 2)}\n`;

    if (write) {
      const outPath = resolve(globals.cwd, write);
      await writeTextFile(outPath, json);
      io.stdout(outPath);
      return 0;
    }

    io.stdout(json.trimEnd());
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
    const snapshot = await readOrGenerateSchematicMapVersionSnapshot(
      globals.dataDir,
      id,
    );
    const svg = await renderSchematicMapPreviewSvg(globals.dataDir, snapshot);

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
    'schematic-map requires list, show, select, stats, diff, generator-diff, copy-constraints, validate-submission, inventory, generate, or preview',
  );
}
