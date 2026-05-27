import {
  type SchematicMapConstraint,
  type SchematicMapConstraintSet,
  type SchematicMapEffectiveDate,
  SchematicMapEffectiveDateSchema,
  type SchematicMapFrame,
  type SchematicMapLabelSide,
  type SchematicMapLayoutEngineId,
  SchematicMapLayoutEngineIdSchema,
  type SchematicMapPoint,
  type SchematicMapRuleSet,
  type SchematicMapSegment,
  type SchematicMapStationCodeLabel,
  type SchematicMapStationNode,
  type SchematicMapVersionSnapshot,
  SchematicMapVersionSnapshotSchema,
  type Service,
  type Station,
} from '@mrtdown/core';
import { listEntities } from './entities.js';
import {
  readSchematicMapConstraintSet,
  readSchematicMapRuleSet,
} from './schematicMaps.js';

export type GenerateSchematicMapVersionSnapshotOptions = {
  effectiveDate: SchematicMapEffectiveDate;
  layoutEngineId?: SchematicMapLayoutEngineId;
  generatedAt?: string;
};

type ActiveTopology = {
  lineIds: string[];
  lineStations: Map<string, string[]>;
  lineSegments: Map<
    string,
    Map<
      string,
      {
        fromStationId: string;
        toStationId: string;
      }
    >
  >;
  stationLineIds: Map<string, Set<string>>;
};

function timestampForSchematicMapGenerator(value: string): number {
  const normalized = /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T00:00:00+08:00`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+08:00`
      : value;
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp for schematic map generation: ${value}`);
  }
  return timestamp;
}

function effectiveMonthInterval(effectiveDate: SchematicMapEffectiveDate): {
  start: number;
  end: number;
} {
  const [year, month] = effectiveDate.split('-').map(Number);
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const formatMonth = (value: number) => value.toString().padStart(2, '0');

  return {
    start: timestampForSchematicMapGenerator(
      `${year}-${formatMonth(month)}-01`,
    ),
    end: timestampForSchematicMapGenerator(
      `${endYear}-${formatMonth(endMonth)}-01`,
    ),
  };
}

function intervalOverlapsEffectiveMonth(
  startAt: string,
  endAt: string | null,
  effectiveDate: SchematicMapEffectiveDate,
): boolean {
  const effectiveMonth = effectiveMonthInterval(effectiveDate);
  const start = timestampForSchematicMapGenerator(startAt);
  const end = endAt
    ? timestampForSchematicMapGenerator(endAt)
    : Number.POSITIVE_INFINITY;

  return start < effectiveMonth.end && effectiveMonth.start < end;
}

function stationPairKey(fromStationId: string, toStationId: string): string {
  return [fromStationId, toStationId]
    .sort((a, b) => a.localeCompare(b))
    .join(':');
}

function baseSegmentId(fromStationId: string, toStationId: string): string {
  const [from, to] = [fromStationId, toStationId]
    .map((stationId) => stationId.toLowerCase())
    .sort((a, b) => a.localeCompare(b));
  return `line_${from}:${to}`;
}

function segmentId(
  fromStationId: string,
  toStationId: string,
  lineId: string,
  pairLineCounts: Map<string, number>,
): string {
  const baseId = baseSegmentId(fromStationId, toStationId);
  return (pairLineCounts.get(stationPairKey(fromStationId, toStationId)) ?? 0) >
    1
    ? `${baseId}_${lineIdPart(lineId)}`
    : baseId;
}

function stationIdPart(stationId: string): string {
  return stationId.toLowerCase();
}

function lineIdPart(lineId: string): string {
  return lineId.toLowerCase();
}

function compareStationPaths(
  a: readonly string[],
  b: readonly string[],
): number {
  return a.join('\0').localeCompare(b.join('\0'));
}

function buildAdjacency(
  segments: Map<string, { fromStationId: string; toStationId: string }>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const neighbors = adjacency.get(from) ?? new Set<string>();
    neighbors.add(to);
    adjacency.set(from, neighbors);
  };

  for (const segment of segments.values()) {
    add(segment.fromStationId, segment.toStationId);
    add(segment.toStationId, segment.fromStationId);
  }

  return adjacency;
}

function shortestStationPath(
  adjacency: Map<string, Set<string>>,
  start: string,
  end: string,
): string[] | undefined {
  const queue = [start];
  const previous = new Map<string, string | null>([[start, null]]);

  for (let index = 0; index < queue.length; index += 1) {
    const stationId = queue[index];
    if (stationId === end) {
      break;
    }

    const neighbors = [...(adjacency.get(stationId) ?? [])].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const neighbor of neighbors) {
      if (previous.has(neighbor)) {
        continue;
      }
      previous.set(neighbor, stationId);
      queue.push(neighbor);
    }
  }

  if (!previous.has(end)) {
    return undefined;
  }

  const path: string[] = [];
  for (
    let stationId: string | null = end;
    stationId != null;
    stationId = previous.get(stationId) ?? null
  ) {
    path.unshift(stationId);
  }

  return path;
}

function longestStationPath(
  adjacency: Map<string, Set<string>>,
  candidates: readonly string[],
): string[] {
  const sortedCandidates = [...candidates].sort((a, b) => a.localeCompare(b));
  let bestPath: string[] = [];

  for (
    let startIndex = 0;
    startIndex < sortedCandidates.length;
    startIndex += 1
  ) {
    for (
      let endIndex = startIndex + 1;
      endIndex < sortedCandidates.length;
      endIndex += 1
    ) {
      const path = shortestStationPath(
        adjacency,
        sortedCandidates[startIndex],
        sortedCandidates[endIndex],
      );
      if (!path) {
        continue;
      }

      if (
        path.length > bestPath.length ||
        (path.length === bestPath.length &&
          compareStationPaths(path, bestPath) < 0)
      ) {
        bestPath = path;
      }
    }
  }

  return bestPath.length > 0 ? bestPath : sortedCandidates.slice(0, 1);
}

function appendBranchStations(
  stationId: string,
  adjacency: Map<string, Set<string>>,
  seen: Set<string>,
  output: string[],
): void {
  const neighbors = [...(adjacency.get(stationId) ?? [])].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const neighbor of neighbors) {
    if (seen.has(neighbor)) {
      continue;
    }

    seen.add(neighbor);
    output.push(neighbor);
    appendBranchStations(neighbor, adjacency, seen, output);
  }
}

function deriveLineStationOrder(
  segments: Map<string, { fromStationId: string; toStationId: string }>,
  referencePaths: readonly string[][],
): string[] {
  const adjacency = buildAdjacency(segments);
  const stationIds = [...adjacency.keys()].sort((a, b) => a.localeCompare(b));
  if (stationIds.length <= 1) {
    return stationIds;
  }

  const terminals = stationIds.filter(
    (stationId) => (adjacency.get(stationId)?.size ?? 0) <= 1,
  );
  const trunk = longestStationPath(
    adjacency,
    terminals.length >= 2 ? terminals : stationIds,
  );
  const orientedTrunk = orientStationPath(trunk, referencePaths);
  const seen = new Set(orientedTrunk);
  const ordered = [...orientedTrunk];

  for (const stationId of orientedTrunk) {
    appendBranchStations(stationId, adjacency, seen, ordered);
  }

  return ordered;
}

function orientStationPath(
  path: readonly string[],
  referencePaths: readonly string[][],
): string[] {
  if (path.length <= 1) {
    return [...path];
  }

  const firstStationId = path[0];
  const lastStationId = path[path.length - 1];
  const sortedReferencePaths = [...referencePaths].sort(
    (a, b) => b.length - a.length,
  );

  for (const referencePath of sortedReferencePaths) {
    const firstIndex = referencePath.indexOf(firstStationId);
    const lastIndex = referencePath.indexOf(lastStationId);
    if (firstIndex === -1 || lastIndex === -1) {
      continue;
    }

    return firstIndex <= lastIndex ? [...path] : [...path].reverse();
  }

  return [...path];
}

function compareByPreferredOrder(order: readonly string[]) {
  const indexByValue = new Map(order.map((value, index) => [value, index]));
  return (a: string, b: string): number => {
    const aIndex = indexByValue.get(a) ?? Number.POSITIVE_INFINITY;
    const bIndex = indexByValue.get(b) ?? Number.POSITIVE_INFINITY;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.localeCompare(b);
  };
}

async function readOptionalConstraintSet(
  dataDir: string,
  effectiveDate: SchematicMapEffectiveDate,
): Promise<SchematicMapConstraintSet | undefined> {
  try {
    return (await readSchematicMapConstraintSet(dataDir, effectiveDate)).value;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function lineOrderFromInputs(
  ruleSet: SchematicMapRuleSet,
  constraintSet: SchematicMapConstraintSet | undefined,
): string[] {
  let lineOrderConstraint:
    | Extract<SchematicMapConstraint, { type: 'line_order' }>
    | undefined;

  for (const constraint of constraintSet?.constraints ?? []) {
    if (constraint.type === 'line_order') {
      lineOrderConstraint = constraint;
    }
  }

  return lineOrderConstraint?.lineIds ?? ruleSet.lineOrder;
}

function frameFromConstraints(
  constraintSet: SchematicMapConstraintSet | undefined,
): SchematicMapFrame {
  let constraint:
    | Extract<SchematicMapConstraint, { type: 'map_frame' }>
    | undefined;

  for (const entry of constraintSet?.constraints ?? []) {
    if (entry.type === 'map_frame') {
      constraint = entry;
    }
  }

  if (!constraint) {
    return {
      x: 0,
      y: 0,
      width: 3140,
      height: 2400,
      coordinateMetadata: {
        coordinateClass: 'generated',
        ruleId: 'default-map-frame',
      },
    };
  }

  return {
    ...constraint.frame,
    coordinateMetadata: {
      coordinateClass: 'constraint',
      constraintId: constraint.id,
    },
  };
}

function buildActiveTopology(
  services: readonly Service[],
  effectiveDate: SchematicMapEffectiveDate,
): ActiveTopology {
  const lineIds = new Set<string>();
  const lineStations = new Map<string, string[]>();
  const lineSegments = new Map<
    string,
    Map<string, { fromStationId: string; toStationId: string }>
  >();
  const lineRevisionPaths = new Map<string, string[][]>();
  const stationLineIds = new Map<string, Set<string>>();

  for (const service of services) {
    for (const revision of service.revisions) {
      if (
        !intervalOverlapsEffectiveMonth(
          revision.startAt,
          revision.endAt,
          effectiveDate,
        )
      ) {
        continue;
      }

      lineIds.add(service.lineId);
      const segmentsForLine = lineSegments.get(service.lineId) ?? new Map();
      lineSegments.set(service.lineId, segmentsForLine);

      const stationIds = revision.path.stations.map(
        (station) => station.stationId,
      );
      const revisionPathsForLine = lineRevisionPaths.get(service.lineId) ?? [];
      revisionPathsForLine.push(stationIds);
      lineRevisionPaths.set(service.lineId, revisionPathsForLine);

      for (const stationId of stationIds) {
        const lineIdsForStation = stationLineIds.get(stationId) ?? new Set();
        lineIdsForStation.add(service.lineId);
        stationLineIds.set(stationId, lineIdsForStation);
      }

      for (let index = 0; index < stationIds.length - 1; index += 1) {
        const fromStationId = stationIds[index];
        const toStationId = stationIds[index + 1];
        const key = stationPairKey(fromStationId, toStationId);
        if (!segmentsForLine.has(key)) {
          segmentsForLine.set(key, { fromStationId, toStationId });
        }
      }
    }
  }

  for (const [lineId, segments] of lineSegments) {
    lineStations.set(
      lineId,
      deriveLineStationOrder(segments, lineRevisionPaths.get(lineId) ?? []),
    );
  }

  return {
    lineIds: [...lineIds],
    lineStations,
    lineSegments,
    stationLineIds,
  };
}

function activeStationCodesByStationAndLine(
  stations: readonly Station[],
  effectiveDate: SchematicMapEffectiveDate,
): Map<string, Map<string, string>> {
  const codes = new Map<string, Map<string, string>>();

  for (const station of stations) {
    for (const stationCode of station.stationCodes) {
      if (
        !intervalOverlapsEffectiveMonth(
          stationCode.startedAt,
          stationCode.endedAt,
          effectiveDate,
        )
      ) {
        continue;
      }

      const codesByLine = codes.get(station.id) ?? new Map<string, string>();
      if (!codesByLine.has(stationCode.lineId)) {
        codesByLine.set(stationCode.lineId, stationCode.code);
      }
      codes.set(station.id, codesByLine);
    }
  }

  return codes;
}

function stationAnchorConstraints(
  constraintSet: SchematicMapConstraintSet | undefined,
): Map<string, Extract<SchematicMapConstraint, { type: 'station_anchor' }>> {
  const anchors = new Map<
    string,
    Extract<SchematicMapConstraint, { type: 'station_anchor' }>
  >();

  for (const constraint of constraintSet?.constraints ?? []) {
    if (constraint.type === 'station_anchor') {
      anchors.set(constraint.stationId, constraint);
    }
  }

  return anchors;
}

function labelHintConstraints(
  constraintSet: SchematicMapConstraintSet | undefined,
): Map<string, Extract<SchematicMapConstraint, { type: 'label_hint' }>> {
  const hints = new Map<
    string,
    Extract<SchematicMapConstraint, { type: 'label_hint' }>
  >();

  for (const constraint of constraintSet?.constraints ?? []) {
    if (constraint.type === 'label_hint') {
      hints.set(constraint.stationId, constraint);
    }
  }

  return hints;
}

function segmentRouteHintConstraints(
  constraintSet: SchematicMapConstraintSet | undefined,
): Map<
  string,
  Extract<SchematicMapConstraint, { type: 'segment_route_hint' }>
> {
  const hints = new Map<
    string,
    Extract<SchematicMapConstraint, { type: 'segment_route_hint' }>
  >();

  for (const constraint of constraintSet?.constraints ?? []) {
    if (constraint.type === 'segment_route_hint') {
      hints.set(
        `${constraint.lineId}:${stationPairKey(
          constraint.fromStationId,
          constraint.toStationId,
        )}`,
        constraint,
      );
    }
  }

  return hints;
}

function pointWithOffset(
  point: SchematicMapPoint,
  offset: SchematicMapPoint,
): SchematicMapPoint {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

function defaultLabelOffset(side: SchematicMapLabelSide): SchematicMapPoint {
  switch (side) {
    case 'right':
      return { x: 24, y: 0 };
    case 'bottom':
      return { x: 0, y: 24 };
    case 'left':
      return { x: -24, y: 0 };
    case 'top_right':
      return { x: 18, y: -18 };
    case 'bottom_right':
      return { x: 18, y: 18 };
    case 'bottom_left':
      return { x: -18, y: 18 };
    case 'top_left':
      return { x: -18, y: -18 };
    case 'center':
      return { x: 0, y: 0 };
    default:
      return { x: 0, y: -24 };
  }
}

function lineIdsForStation(
  stationLineIds: Set<string>,
  lineOrder: readonly string[],
): string[] {
  return [...stationLineIds].sort(compareByPreferredOrder(lineOrder));
}

export async function generateSchematicMapVersionSnapshot(
  dataDir: string,
  options: GenerateSchematicMapVersionSnapshotOptions,
): Promise<SchematicMapVersionSnapshot> {
  const effectiveDate = SchematicMapEffectiveDateSchema.parse(
    options.effectiveDate,
  );
  const layoutEngineId = SchematicMapLayoutEngineIdSchema.parse(
    options.layoutEngineId ?? 'lta-system-map-2011',
  );
  const [stations, services, ruleSetRecord, constraintSet] = await Promise.all([
    listEntities(dataDir, 'station'),
    listEntities(dataDir, 'service'),
    readSchematicMapRuleSet(dataDir, layoutEngineId),
    readOptionalConstraintSet(dataDir, effectiveDate),
  ]);

  const ruleSet = ruleSetRecord.value;
  const topology = buildActiveTopology(
    services.map((record) => record.value),
    effectiveDate,
  );
  const baseLineOrder = lineOrderFromInputs(ruleSet, constraintSet);
  const lineOrder = [
    ...baseLineOrder.filter((lineId) => topology.lineIds.includes(lineId)),
    ...topology.lineIds
      .filter((lineId) => !baseLineOrder.includes(lineId))
      .sort((a, b) => a.localeCompare(b)),
  ];
  const frame = frameFromConstraints(constraintSet);
  const anchors = stationAnchorConstraints(constraintSet);
  const labelHints = labelHintConstraints(constraintSet);
  const segmentRouteHints = segmentRouteHintConstraints(constraintSet);
  const activeStationCodes = activeStationCodesByStationAndLine(
    stations.map((record) => record.value),
    effectiveDate,
  );
  const stationPositions = new Map<string, SchematicMapPoint>();
  const stationCoordinateMetadata = new Map<
    string,
    SchematicMapStationNode['coordinateMetadata']
  >();
  const lineSpacing =
    lineOrder.length <= 1
      ? 0
      : Math.min(140, (frame.height - 240) / (lineOrder.length - 1));

  lineOrder.forEach((lineId, lineIndex) => {
    const stationsForLine = topology.lineStations.get(lineId) ?? [];
    const stationSpacing =
      stationsForLine.length <= 1
        ? 0
        : (frame.width - 160) / (stationsForLine.length - 1);
    const y = frame.y + 120 + lineIndex * lineSpacing;

    stationsForLine.forEach((stationId, stationIndex) => {
      if (stationPositions.has(stationId)) {
        return;
      }

      const anchor = anchors.get(stationId);
      if (anchor) {
        stationPositions.set(stationId, anchor.point);
        stationCoordinateMetadata.set(stationId, {
          coordinateClass: 'constraint',
          constraintId: anchor.id,
        });
        return;
      }

      stationPositions.set(stationId, {
        x: frame.x + 80 + stationIndex * stationSpacing,
        y,
      });
      stationCoordinateMetadata.set(stationId, {
        coordinateClass: 'generated',
        ruleId: 'service-order-grid',
      });
    });
  });

  const segments: SchematicMapSegment[] = [];
  const segmentPairLineCounts = new Map<string, number>();

  for (const segmentsForLine of topology.lineSegments.values()) {
    for (const key of segmentsForLine.keys()) {
      segmentPairLineCounts.set(key, (segmentPairLineCounts.get(key) ?? 0) + 1);
    }
  }

  const lineGroups = lineOrder.map((lineId) => {
    const segmentsForLine = topology.lineSegments.get(lineId) ?? new Map();
    const segmentIds: string[] = [];

    for (const [key, segment] of [...segmentsForLine.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const from = stationPositions.get(segment.fromStationId);
      const to = stationPositions.get(segment.toStationId);
      if (!from || !to) {
        continue;
      }

      const id = segmentId(
        segment.fromStationId,
        segment.toStationId,
        lineId,
        segmentPairLineCounts,
      );
      const routeHint = segmentRouteHints.get(`${lineId}:${key}`);
      const via = routeHint
        ? routeHint.fromStationId === segment.toStationId
          ? [...routeHint.via].reverse()
          : routeHint.via
        : [];

      segmentIds.push(id);
      segments.push({
        id,
        lineId,
        displayStatus: 'operational',
        layerId: 'lines',
        topology: {
          type: 'station_pair',
          fromStationId: segment.fromStationId,
          toStationId: segment.toStationId,
        },
        geometry: {
          type: 'polyline',
          points: [from, ...via, to],
          coordinateMetadata: routeHint
            ? {
                coordinateClass: 'constraint',
                constraintId: routeHint.id,
              }
            : {
                coordinateClass: 'generated',
                ruleId: 'service-adjacency-polyline',
              },
        },
      });
    }

    return {
      id: `line_${lineIdPart(lineId)}`,
      lineId,
      displayStatus: 'operational' as const,
      layerId: 'lines',
      segmentIds,
    };
  });

  const stationNodes: SchematicMapStationNode[] = [
    ...topology.stationLineIds.entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([stationId, stationLineIdSet]) => {
      const center = stationPositions.get(stationId);
      if (!center) {
        return [];
      }

      const lineIds = lineIdsForStation(stationLineIdSet, lineOrder);
      return [
        {
          id: `node_${stationIdPart(stationId)}`,
          stationId,
          displayStatus: 'operational',
          layerId: 'nodes',
          center,
          lineIds,
          parts: lineIds.map((lineId, index) => ({
            id: `node_${stationIdPart(stationId)}_${lineIdPart(lineId)}`,
            lineId,
            shape: {
              type: 'circle' as const,
              center:
                lineIds.length === 1
                  ? center
                  : {
                      x: center.x + (index - (lineIds.length - 1) / 2) * 9,
                      y: center.y,
                    },
              radius: 7,
            },
            coordinateMetadata: {
              coordinateClass: 'artifact' as const,
              generatedFrom: `node_${stationIdPart(stationId)}`,
            },
          })),
          coordinateMetadata: stationCoordinateMetadata.get(stationId) ?? {
            coordinateClass: 'generated',
            ruleId: 'service-order-grid',
          },
        },
      ];
    });

  const labels = stationNodes.map((node) => {
    const hint = labelHints.get(node.stationId);
    const side = hint?.side ?? 'top';
    const offset = hint?.offset ?? defaultLabelOffset(side);

    return {
      id: `label_${stationIdPart(node.stationId)}`,
      stationId: node.stationId,
      displayStatus: 'operational' as const,
      layerId: 'labels',
      anchor: pointWithOffset(node.center, offset),
      side,
      coordinateMetadata: hint
        ? {
            coordinateClass: 'constraint' as const,
            constraintId: hint.id,
          }
        : {
            coordinateClass: 'generated' as const,
            ruleId: 'default-station-label',
          },
    };
  });

  const stationCodeLabels: SchematicMapStationCodeLabel[] =
    stationNodes.flatMap((node) => {
      const codesByLine = activeStationCodes.get(node.stationId);
      if (!codesByLine) {
        return [];
      }

      return node.lineIds.flatMap((lineId, index) => {
        const code = codesByLine.get(lineId);
        if (!code) {
          return [];
        }

        return [
          {
            id: code,
            stationId: node.stationId,
            lineId,
            displayStatus: 'operational' as const,
            layerId: 'labels',
            anchor: {
              x: node.center.x + index * 18,
              y: node.center.y + 18,
            },
            side: 'bottom' as const,
            coordinateMetadata: {
              coordinateClass: 'generated' as const,
              ruleId: 'default-station-code-label',
            },
          },
        ];
      });
    });

  return SchematicMapVersionSnapshotSchema.parse({
    schemaVersion: 1,
    mapId: 'system',
    effectiveDate,
    layoutEngineId,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    frame,
    layers: [
      { id: 'lines', role: 'line' },
      { id: 'nodes', role: 'node' },
      { id: 'labels', role: 'label' },
    ],
    lineGroups,
    segments,
    stationNodes,
    labels,
    stationCodeLabels,
  });
}
