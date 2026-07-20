#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function usage() {
  return [
    'Usage:',
    '  node scripts/infer-station-platforms.mjs [options]',
    '',
    'Options:',
    '  --as-of <YYYY-MM-DD>       Service snapshot date (default: latest observation)',
    '  --data-dir <path>          Canonical data directory (default: data)',
    '  --observations <path>      Observation JSON file',
    '  --apply                    Write eligible platforms into station data',
    '  --write <path>             Write the report instead of printing it',
    '  -h, --help                 Show this help',
    '',
    'Without --apply this is a read-only hypothesis-testing tool. Applying',
    'writes direct observations and conservative same-line inferences only.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    asOf: undefined,
    apply: false,
    dataDir: resolve('data'),
    observations: resolve('scripts/platform-observations.json'),
    write: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      return { ...options, help: true };
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    const optionNames = new Map([
      ['--as-of', 'asOf'],
      ['--data-dir', 'dataDir'],
      ['--observations', 'observations'],
      ['--write', 'write'],
    ]);
    const optionName = optionNames.get(arg);
    if (!optionName) {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }

    const value = argv[index + 1];
    if (!value) {
      throw new Error(`${arg} requires a value`);
    }
    options[optionName] = optionName === 'asOf' ? value : resolve(value);
    index += 1;
  }

  return options;
}

function assertDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD date`);
  }
}

function activeDuring(record, date) {
  return (
    record.startedAt <= date &&
    (record.endedAt == null || date < record.endedAt)
  );
}

function activeRevision(service, date) {
  const revisions = service.revisions.filter(
    (revision) =>
      revision.startAt <= date &&
      (revision.endAt == null || date < revision.endAt),
  );
  if (revisions.length > 1) {
    throw new Error(
      `${service.id} has ${revisions.length} active revisions on ${date}`,
    );
  }
  return revisions[0];
}

async function readJsonDirectory(path) {
  const files = (await readdir(path))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(resolve(path, file)))),
  );
}

function downstreamServiceIds({
  activeServices,
  lineId,
  stationId,
  towardsStationId,
}) {
  const matches = [];
  for (const service of activeServices) {
    if (service.value.lineId !== lineId) {
      continue;
    }

    const stationIds = service.revision.path.stations.map(
      (station) => station.stationId,
    );
    const stationIndexes = stationIds.flatMap((candidate, index) =>
      candidate === stationId ? [index] : [],
    );
    const towardsIndexes = stationIds.flatMap((candidate, index) =>
      candidate === towardsStationId ? [index] : [],
    );
    if (
      stationIndexes.some((stationIndex) =>
        towardsIndexes.some((towardsIndex) => stationIndex < towardsIndex),
      )
    ) {
      matches.push(service.value.id);
    }
  }
  return matches;
}

function addMapping(mappingByServiceId, serviceId, observation) {
  const current = mappingByServiceId.get(serviceId);
  if (current && current.platformLabel !== observation.platformLabel) {
    throw new Error(
      `${serviceId} maps to both platform ${current.platformLabel} and ` +
        `${observation.platformLabel}`,
    );
  }

  if (current) {
    current.observations.push(observation);
    return;
  }
  mappingByServiceId.set(serviceId, {
    lineId: observation.lineId,
    serviceId,
    platformLabel: observation.platformLabel,
    observations: [observation],
  });
}

function platformId(stationId, lineId, label) {
  return `${stationId}_${lineId}_${label}`;
}

function platformKey(stationId, lineId, label) {
  return [stationId, lineId, label].join('|');
}

function pushPlatform(platformsByStationId, stationId, platform) {
  const platforms = platformsByStationId.get(stationId) ?? [];
  if (platforms.some((candidate) => candidate.id === platform.id)) {
    return;
  }
  platforms.push(platform);
  platformsByStationId.set(stationId, platforms);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const observations = JSON.parse(await readFile(options.observations, 'utf8'));
if (!Array.isArray(observations) || observations.length === 0) {
  throw new Error('Observations must be a non-empty JSON array');
}

for (const [index, observation] of observations.entries()) {
  for (const field of ['stationId', 'lineId', 'platformLabel']) {
    if (typeof observation[field] !== 'string' || !observation[field]) {
      throw new Error(`observations.${index}.${field} must be a string`);
    }
  }
  const hasTowardsStation = observation.towardsStationId !== undefined;
  if (
    hasTowardsStation &&
    (typeof observation.towardsStationId !== 'string' ||
      !observation.towardsStationId)
  ) {
    throw new Error(
      `observations.${index}.towardsStationId must be a non-empty string`,
    );
  }
  const hasServiceIds = observation.serviceIds !== undefined;
  if (
    hasServiceIds &&
    (!Array.isArray(observation.serviceIds) ||
      observation.serviceIds.length === 0 ||
      observation.serviceIds.some(
        (serviceId) => typeof serviceId !== 'string' || !serviceId,
      ))
  ) {
    throw new Error(
      `observations.${index}.serviceIds must be a non-empty string array`,
    );
  }
  if (!hasTowardsStation && !hasServiceIds) {
    throw new Error(
      `observations.${index} must specify towardsStationId or serviceIds`,
    );
  }
  assertDate(observation.observedAt, `observations.${index}.observedAt`);
}

const latestObservation = observations
  .map((observation) => observation.observedAt)
  .sort()
  .at(-1);
const asOf = options.asOf ?? latestObservation;
assertDate(asOf, '--as-of');

const [lines, services, stations] = await Promise.all([
  readJsonDirectory(resolve(options.dataDir, 'line')),
  readJsonDirectory(resolve(options.dataDir, 'service')),
  readJsonDirectory(resolve(options.dataDir, 'station')),
]);
const lineById = new Map(lines.map((line) => [line.id, line]));
const stationById = new Map(stations.map((station) => [station.id, station]));
const activeServices = services.flatMap((service) => {
  const revision = activeRevision(service, asOf);
  return revision ? [{ value: service, revision }] : [];
});
const activeServiceById = new Map(
  activeServices.map((service) => [service.value.id, service]),
);

const mappingByServiceId = new Map();
const resolvedObservations = observations.map((observation) => {
  if (observation.observedAt > asOf) {
    throw new Error(
      `${observation.stationId} observation date ${observation.observedAt} ` +
        `is after the ${asOf} service snapshot`,
    );
  }
  if (!lineById.has(observation.lineId)) {
    throw new Error(`Unknown line: ${observation.lineId}`);
  }
  if (!stationById.has(observation.stationId)) {
    throw new Error(`Unknown station: ${observation.stationId}`);
  }
  if (
    observation.towardsStationId &&
    !stationById.has(observation.towardsStationId)
  ) {
    throw new Error(`Unknown towards station: ${observation.towardsStationId}`);
  }

  const downstreamMatches = observation.towardsStationId
    ? downstreamServiceIds({
        activeServices,
        lineId: observation.lineId,
        stationId: observation.stationId,
        towardsStationId: observation.towardsStationId,
      })
    : [];
  const serviceIds = observation.serviceIds
    ? [...new Set(observation.serviceIds)]
    : downstreamMatches;

  for (const serviceId of serviceIds) {
    const service = activeServiceById.get(serviceId);
    if (!service) {
      throw new Error(`Unknown or inactive service on ${asOf}: ${serviceId}`);
    }
    const observedRevision = activeRevision(
      service.value,
      observation.observedAt,
    );
    if (!observedRevision) {
      throw new Error(
        `${serviceId} was inactive on observation date ${observation.observedAt}`,
      );
    }
    if (observedRevision !== service.revision) {
      throw new Error(
        `${serviceId} changed revision between observation date ` +
          `${observation.observedAt} and service snapshot ${asOf}`,
      );
    }
    if (service.value.lineId !== observation.lineId) {
      throw new Error(
        `${serviceId} belongs to ${service.value.lineId}, not ${observation.lineId}`,
      );
    }
    if (
      !service.revision.path.stations.some(
        (stop) => stop.stationId === observation.stationId,
      )
    ) {
      throw new Error(
        `${serviceId} does not serve ${observation.stationId} on ${asOf}`,
      );
    }
    if (
      observation.towardsStationId &&
      !downstreamMatches.includes(serviceId)
    ) {
      throw new Error(
        `${serviceId} does not travel from ${observation.stationId} towards ` +
          `${observation.towardsStationId} on ${asOf}`,
      );
    }
  }
  if (serviceIds.length === 0) {
    throw new Error(
      `No active ${observation.lineId} service travels from ` +
        `${observation.stationId} towards ${observation.towardsStationId} ` +
        `on ${asOf}`,
    );
  }

  const resolved = { ...observation, serviceIds };
  for (const serviceId of serviceIds) {
    addMapping(mappingByServiceId, serviceId, resolved);
  }
  return resolved;
});

const observedPlatformsByKey = new Map();
for (const observation of resolvedObservations) {
  const key = platformKey(
    observation.stationId,
    observation.lineId,
    observation.platformLabel,
  );
  const current = observedPlatformsByKey.get(key);
  if (current) {
    current.lastUpdated = [current.lastUpdated, observation.observedAt]
      .sort()
      .at(-1);
    current.serviceIds = [
      ...new Set([...current.serviceIds, ...observation.serviceIds]),
    ];
    continue;
  }
  observedPlatformsByKey.set(key, {
    id: platformId(
      observation.stationId,
      observation.lineId,
      observation.platformLabel,
    ),
    label: observation.platformLabel,
    lastUpdated: observation.observedAt,
    lineId: observation.lineId,
    serviceIds: [...observation.serviceIds],
  });
}
const observedLineIds = new Set(
  observations.map((observation) => observation.lineId),
);
const lineReports = lines
  .filter((line) => observedLineIds.has(line.id))
  .sort(
    (left, right) =>
      left.startedAt.localeCompare(right.startedAt) ||
      left.id.localeCompare(right.id),
  )
  .map((line) => {
    const lineServices = activeServices.filter(
      (service) => service.value.lineId === line.id,
    );
    const candidates = [];
    const skipped = [];

    for (const station of stations) {
      const activeCodes = station.stationCodes.filter((code) =>
        activeDuring(code, asOf),
      );
      if (!activeCodes.some((code) => code.lineId === line.id)) {
        continue;
      }

      const servingServices = lineServices.flatMap((service) => {
        const occurrences = service.revision.path.stations.filter(
          (stop) => stop.stationId === station.id,
        ).length;
        return occurrences > 0 ? [{ ...service, occurrences }] : [];
      });
      if (servingServices.length === 0) {
        skipped.push({ stationId: station.id, reason: 'no_active_services' });
        continue;
      }
      if (servingServices.some((service) => service.occurrences !== 1)) {
        skipped.push({
          stationId: station.id,
          reason: 'service_repeats_station',
          serviceIds: servingServices
            .filter((service) => service.occurrences !== 1)
            .map((service) => service.value.id),
        });
        continue;
      }
      const endpointServiceIds = servingServices
        .filter((service) => {
          const stops = service.revision.path.stations;
          return (
            stops[0]?.stationId === station.id ||
            stops.at(-1)?.stationId === station.id
          );
        })
        .map((service) => service.value.id);
      if (endpointServiceIds.length > 0) {
        skipped.push({
          stationId: station.id,
          reason: 'service_endpoint',
          serviceIds: endpointServiceIds,
        });
        continue;
      }

      const unmappedServiceIds = servingServices
        .map((service) => service.value.id)
        .filter((serviceId) => !mappingByServiceId.has(serviceId));
      if (unmappedServiceIds.length > 0) {
        skipped.push({
          stationId: station.id,
          reason: 'unmapped_services',
          serviceIds: unmappedServiceIds,
        });
        continue;
      }

      const serviceIdsByLabel = new Map();
      for (const service of servingServices) {
        const mapping = mappingByServiceId.get(service.value.id);
        const serviceIds = serviceIdsByLabel.get(mapping.platformLabel) ?? [];
        serviceIds.push(service.value.id);
        serviceIdsByLabel.set(mapping.platformLabel, serviceIds);
      }
      if (serviceIdsByLabel.size < 2) {
        skipped.push({
          stationId: station.id,
          reason: 'fewer_than_two_inferred_platforms',
          serviceIds: servingServices.map((service) => service.value.id),
        });
        continue;
      }

      const riskFlags = [];
      if (activeCodes.length > 1) {
        riskFlags.push('interchange');
      }
      if (servingServices.length > 2) {
        riskFlags.push('multiple_service_patterns');
      }

      const proposedPlatforms = [...serviceIdsByLabel]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, serviceIds]) => ({
          id: platformId(station.id, line.id, label),
          label,
          lineId: line.id,
          serviceIds,
        }));
      const observedPlatformCount = proposedPlatforms.filter((platform) =>
        observedPlatformsByKey.has(
          platformKey(station.id, line.id, platform.label),
        ),
      ).length;

      candidates.push({
        stationId: station.id,
        stationName: station.name['en-SG'],
        lineId: line.id,
        riskFlags,
        proposedPlatforms,
        applicationStatus:
          observedPlatformCount === proposedPlatforms.length
            ? 'direct_observation'
            : riskFlags.includes('interchange')
              ? 'review_only'
              : observedPlatformCount > 0
                ? 'mixed_observation_inference'
                : 'eligible_inference',
      });
    }

    return {
      lineId: line.id,
      lineName: line.name['en-SG'],
      startedAt: line.startedAt,
      candidates,
      skipped,
    };
  });

const canonicalPlatformsByStationId = new Map();
for (const observation of resolvedObservations) {
  const platform = observedPlatformsByKey.get(
    platformKey(
      observation.stationId,
      observation.lineId,
      observation.platformLabel,
    ),
  );
  pushPlatform(canonicalPlatformsByStationId, observation.stationId, platform);
}

for (const lineReport of lineReports) {
  for (const candidate of lineReport.candidates) {
    if (candidate.applicationStatus === 'review_only') {
      continue;
    }

    for (const proposedPlatform of candidate.proposedPlatforms) {
      if (
        observedPlatformsByKey.has(
          platformKey(
            candidate.stationId,
            proposedPlatform.lineId,
            proposedPlatform.label,
          ),
        )
      ) {
        continue;
      }

      const basis = new Map();
      let inferenceLastUpdated;
      for (const serviceId of proposedPlatform.serviceIds) {
        const mapping = mappingByServiceId.get(serviceId);
        for (const observation of mapping.observations) {
          if (
            observation.stationId === candidate.stationId ||
            observation.platformLabel !== proposedPlatform.label
          ) {
            continue;
          }
          const basisPlatformId = platformId(
            observation.stationId,
            observation.lineId,
            observation.platformLabel,
          );
          basis.set(`${observation.stationId}/${basisPlatformId}`, {
            stationId: observation.stationId,
            platformId: basisPlatformId,
          });
          if (
            inferenceLastUpdated === undefined ||
            inferenceLastUpdated < observation.observedAt
          ) {
            inferenceLastUpdated = observation.observedAt;
          }
        }
      }
      if (basis.size === 0) {
        continue;
      }

      pushPlatform(canonicalPlatformsByStationId, candidate.stationId, {
        id: proposedPlatform.id,
        label: proposedPlatform.label,
        lastUpdated: inferenceLastUpdated,
        lineId: proposedPlatform.lineId,
        serviceIds: proposedPlatform.serviceIds,
        inference: {
          method: 'same-line-platform-label',
          basis: [...basis.values()],
        },
      });
    }
  }
}

let appliedStationCount = 0;
let appliedPlatformCount = 0;
if (options.apply) {
  const lineOrder = new Map(
    [...lines]
      .sort(
        (left, right) =>
          left.startedAt.localeCompare(right.startedAt) ||
          left.id.localeCompare(right.id),
      )
      .map((line, index) => [line.id, index]),
  );
  for (const [stationId, inferredPlatforms] of canonicalPlatformsByStationId) {
    const station = stationById.get(stationId);
    const existingPlatforms = station.layout?.platforms ?? [];
    const platformById = new Map(
      existingPlatforms.map((platform) => [platform.id, platform]),
    );
    for (const platform of inferredPlatforms) {
      const existing = platformById.get(platform.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(platform)) {
        throw new Error(
          `${stationId} platform ${platform.id} already exists with different data`,
        );
      }
      platformById.set(platform.id, platform);
    }

    const platforms = [...platformById.values()].sort(
      (left, right) =>
        (lineOrder.get(left.lineId) ?? Number.MAX_SAFE_INTEGER) -
          (lineOrder.get(right.lineId) ?? Number.MAX_SAFE_INTEGER) ||
        left.lineId.localeCompare(right.lineId) ||
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    );
    station.layout = { ...station.layout, platforms };
    await writeFile(
      resolve(options.dataDir, 'station', `${stationId}.json`),
      `${JSON.stringify(station, null, 2)}\n`,
    );
    appliedStationCount += 1;
    appliedPlatformCount += inferredPlatforms.length;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  asOf,
  warning:
    'Platform identities are station-local and service assignments are a ' +
    'dated snapshot. Interchanges and structural exceptions remain review-only.',
  resolvedObservations,
  inferredServiceMappings: [...mappingByServiceId.values()].sort(
    (left, right) =>
      left.lineId.localeCompare(right.lineId) ||
      left.serviceId.localeCompare(right.serviceId),
  ),
  summary: {
    observationCount: observations.length,
    mappedServiceCount: mappingByServiceId.size,
    eligibleCanonicalStationCount: canonicalPlatformsByStationId.size,
    eligibleCanonicalPlatformCount: [
      ...canonicalPlatformsByStationId.values(),
    ].reduce((total, platforms) => total + platforms.length, 0),
    appliedStationCount,
    appliedPlatformCount,
    candidateStationLineCount: lineReports.reduce(
      (total, line) => total + line.candidates.length,
      0,
    ),
    skippedStationLineCount: lineReports.reduce(
      (total, line) => total + line.skipped.length,
      0,
    ),
  },
  lines: lineReports,
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (options.write) {
  await mkdir(dirname(options.write), { recursive: true });
  await writeFile(options.write, output);
  console.log(`Wrote ${options.write}`);
} else {
  process.stdout.write(output);
}
