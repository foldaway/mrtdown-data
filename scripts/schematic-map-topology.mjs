#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    dataDir: resolve(process.cwd(), 'data'),
    at: undefined,
    inventory: undefined,
    effectiveDate: undefined,
    write: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--data-dir') {
      options.dataDir = resolve(process.cwd(), readValue(args, index, arg));
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--at') {
      options.at = readValue(args, index, arg);
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--inventory') {
      options.inventory = resolve(process.cwd(), readValue(args, index, arg));
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--effective-date') {
      options.effectiveDate = readValue(args, index, arg);
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--write') {
      options.write = resolve(process.cwd(), readValue(args, index, arg));
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { ...options, help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.at) {
    throw new Error('--at is required');
  }

  if (Boolean(options.inventory) !== Boolean(options.effectiveDate)) {
    throw new Error(
      '--inventory and --effective-date must be provided together',
    );
  }

  return options;
}

function readValue(args, index, name) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function usage() {
  return `Usage:
  node scripts/schematic-map-topology.mjs --at <YYYY-MM-DD|timestamp> [--data-dir <path>] [--inventory <path>] [--effective-date <YYYY-MM>] [--write <path>]

Derives operational line, station, and station-adjacency coverage from canonical
service revisions for a target timestamp.`;
}

function timestamp(value) {
  const normalized = /^\d{4}-\d{2}$/.test(value)
    ? `${value}-01T00:00:00+08:00`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+08:00`
      : value;

  if (
    /^\d{4}-\d{2}-\d{2}T/.test(normalized) &&
    !/(Z|[+-]\d{2}:\d{2})$/i.test(normalized)
  ) {
    throw new Error(
      `Invalid timestamp: ${value}. Include an explicit timezone offset, such as Z or +08:00.`,
    );
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parsed;
}

function activeDuring(target, startAt, endAt) {
  const start = timestamp(startAt);
  const end = endAt ? timestamp(endAt) : Number.POSITIVE_INFINITY;
  return start <= target && target < end;
}

async function listJson(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => readJson(join(dir, entry.name))),
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function segmentKey(fromStationId, toStationId) {
  return [fromStationId, toStationId]
    .map((id) => id.toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join(':');
}

function segmentId(fromStationId, toStationId) {
  return `line_${fromStationId.toLowerCase()}:${toStationId.toLowerCase()}`;
}

function compareWithInventory(topology, inventory, effectiveDate) {
  const map = inventory.maps.find(
    (entry) => entry.effectiveDate === effectiveDate,
  );
  if (!map) {
    throw new Error(`Inventory has no map for effective date ${effectiveDate}`);
  }

  const mapSegmentIds = map.lineSegmentIds.filter((id) =>
    /^line_[a-z0-9]+:[a-z0-9]+$/.test(id),
  );
  const mapSegmentKeys = mapSegmentIds.map((id) => {
    const [fromStationId, toStationId] = id.slice('line_'.length).split(':');
    return segmentKey(fromStationId, toStationId);
  });
  const topologySegmentKeys = new Set(
    topology.lineSegments.map((segment) => segment.key),
  );
  const mapSegmentKeySet = new Set(mapSegmentKeys);
  const topologyStationIds = new Set(topology.stationIds);
  const mapStationIds = new Set(map.stationIds);

  return {
    effectiveDate,
    map: {
      lineSegmentIds: mapSegmentIds.length,
      stationIds: map.stationIds.length,
      viewBox: map.viewBox,
    },
    derived: {
      lineSegmentKeys: topology.lineSegments.length,
      stationIds: topology.stationIds.length,
    },
    missingFromDerived: {
      stationIds: [...mapStationIds]
        .filter((stationId) => !topologyStationIds.has(stationId))
        .sort((a, b) => a.localeCompare(b)),
      segmentKeys: [...mapSegmentKeySet]
        .filter((key) => !topologySegmentKeys.has(key))
        .sort((a, b) => a.localeCompare(b)),
    },
    notInMap: {
      stationIds: topology.stationIds.filter(
        (stationId) => !mapStationIds.has(stationId),
      ),
      segmentKeys: topology.lineSegments
        .map((segment) => segment.key)
        .filter((key) => !mapSegmentKeySet.has(key)),
    },
  };
}

async function buildTopology(dataDir, at) {
  const target = timestamp(at);
  const lines = await listJson(join(dataDir, 'line'));
  const stations = await listJson(join(dataDir, 'station'));
  const services = await listJson(join(dataDir, 'service'));
  const activeLineIds = new Set();
  const activeStationIds = new Set();
  const activeStationCodeStationIds = new Set();
  const activeServiceRevisions = [];
  const lineSegments = new Map();

  for (const station of stations) {
    if (
      station.stationCodes.some((stationCode) =>
        activeDuring(target, stationCode.startedAt, stationCode.endedAt),
      )
    ) {
      activeStationCodeStationIds.add(station.id);
    }
  }

  for (const service of services) {
    for (const revision of service.revisions) {
      if (!activeDuring(target, revision.startAt, revision.endAt)) {
        continue;
      }

      activeLineIds.add(service.lineId);
      activeServiceRevisions.push({
        serviceId: service.id,
        lineId: service.lineId,
        revisionId: revision.id,
        startAt: revision.startAt,
        endAt: revision.endAt,
      });

      for (const station of revision.path.stations) {
        activeStationIds.add(station.stationId);
      }

      for (
        let index = 0;
        index < revision.path.stations.length - 1;
        index += 1
      ) {
        const fromStationId = revision.path.stations[index].stationId;
        const toStationId = revision.path.stations[index + 1].stationId;
        const key = segmentKey(fromStationId, toStationId);
        const existing = lineSegments.get(key);
        const source = {
          serviceId: service.id,
          lineId: service.lineId,
          revisionId: revision.id,
          fromStationId,
          toStationId,
        };

        if (existing) {
          existing.sources.push(source);
          continue;
        }

        lineSegments.set(key, {
          key,
          id: segmentId(fromStationId, toStationId),
          lineId: service.lineId,
          stationIds: [fromStationId, toStationId],
          sources: [source],
        });
      }
    }
  }

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const stationIds = [...activeStationIds].sort((a, b) => a.localeCompare(b));
  const stationCodeStationIds = [...activeStationCodeStationIds].sort((a, b) =>
    a.localeCompare(b),
  );
  return {
    at,
    activeLineIds: [...activeLineIds].sort((a, b) => a.localeCompare(b)),
    activeLines: [...activeLineIds]
      .sort((a, b) => a.localeCompare(b))
      .map((lineId) => ({
        lineId,
        serviceIds: lineById.get(lineId)?.serviceIds ?? [],
      })),
    activeServiceRevisions: activeServiceRevisions.sort((a, b) =>
      `${a.lineId}:${a.serviceId}`.localeCompare(`${b.lineId}:${b.serviceId}`),
    ),
    stationIds,
    stationCodeStationIds,
    stationCodeOnlyIds: stationCodeStationIds.filter(
      (stationId) => !activeStationIds.has(stationId),
    ),
    servicePathOnlyStationIds: stationIds.filter(
      (stationId) => !activeStationCodeStationIds.has(stationId),
    ),
    lineSegments: [...lineSegments.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const topology = await buildTopology(options.dataDir, options.at);
  const output = {
    ...topology,
    comparison:
      options.inventory && options.effectiveDate
        ? compareWithInventory(
            topology,
            await readJson(options.inventory),
            options.effectiveDate,
          )
        : undefined,
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;

  if (options.write) {
    await mkdir(dirname(options.write), { recursive: true });
    await writeFile(options.write, json);
    console.log(relative(process.cwd(), options.write));
    return;
  }

  console.log(json.trimEnd());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
