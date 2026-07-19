import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const SOURCE_ID = 'lta-mrt-station-exit-geojson';
const STATION_SUFFIX = /\s+(?:MRT|LRT) STATION$/i;
const STATION_CODE = /^[A-Z]+\d+[A-Z]?$/;

function usage() {
  return [
    'Usage:',
    '  npm run data:import:lta-station-exits -- <geojson-path> [data-dir]',
    '',
    'Downloads are intentionally separate from this command. Supply the',
    'LTA MRT Station Exit (GEOJSON) file downloaded from data.gov.sg.',
  ].join('\n');
}

function normalizeStationName(value) {
  return value.replace(STATION_SUFFIX, '').trim().toLowerCase();
}

function sourceDate(value) {
  const digits = String(value);
  if (!/^\d{14}$/.test(digits)) {
    throw new Error(`Invalid FMEL_UPD_D value: ${value}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function exitLabel(value) {
  const label = value.replace(/^Exit\s+/i, '').trim();
  if (!label) {
    throw new Error(`Invalid EXIT_CODE value: ${value}`);
  }
  return label;
}

const [geojsonArgument, dataDirArgument = 'data'] = process.argv.slice(2);
if (!geojsonArgument) {
  throw new Error(usage());
}

const geojsonPath = resolve(geojsonArgument);
const stationDir = resolve(dataDirArgument, 'station');
const geojson = JSON.parse(await readFile(geojsonPath, 'utf8'));
if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
  throw new Error(`${geojsonPath} is not a GeoJSON FeatureCollection`);
}

const stationFiles = (await readdir(stationDir))
  .filter((file) => file.endsWith('.json'))
  .sort();
const stations = await Promise.all(
  stationFiles.map(async (file) => ({
    file,
    path: resolve(stationDir, file),
    value: JSON.parse(await readFile(resolve(stationDir, file), 'utf8')),
  })),
);

const stationByName = new Map();
const stationByCode = new Map();
for (const station of stations) {
  const name = normalizeStationName(station.value.name['en-SG']);
  if (stationByName.has(name)) {
    throw new Error(`Duplicate canonical station name: ${name}`);
  }
  stationByName.set(name, station);

  for (const stationCode of station.value.stationCodes) {
    const code = stationCode.code.toUpperCase();
    const previous = stationByCode.get(code);
    if (previous && previous.value.id !== station.value.id) {
      throw new Error(
        `Station code ${code} belongs to both ${previous.value.id} and ${station.value.id}`,
      );
    }
    stationByCode.set(code, station);
  }
}

const exitsByStationId = new Map();
const seenObjectIds = new Set();
const unmatchedSourceStations = new Set();

for (const feature of geojson.features) {
  const sourceName = feature?.properties?.STATION_NA;
  const sourceExitCode = feature?.properties?.EXIT_CODE;
  const sourceObjectId = feature?.properties?.OBJECTID;
  const sourceChecksum = feature?.properties?.INC_CRC;
  const coordinates = feature?.geometry?.coordinates;

  if (
    typeof sourceName !== 'string' ||
    typeof sourceExitCode !== 'string' ||
    !Number.isInteger(sourceObjectId) ||
    typeof sourceChecksum !== 'string' ||
    !/^[0-9A-F]{16}$/.test(sourceChecksum) ||
    feature?.geometry?.type !== 'Point' ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !coordinates.every(Number.isFinite)
  ) {
    throw new Error(`Invalid LTA feature: ${JSON.stringify(feature)}`);
  }
  if (seenObjectIds.has(sourceObjectId)) {
    throw new Error(`Duplicate LTA OBJECTID: ${sourceObjectId}`);
  }
  seenObjectIds.add(sourceObjectId);

  const sourceKey = sourceName.trim().toUpperCase();
  const station = STATION_CODE.test(sourceKey)
    ? stationByCode.get(sourceKey)
    : stationByName.get(normalizeStationName(sourceName));
  if (!station) {
    unmatchedSourceStations.add(sourceName);
    continue;
  }

  const [longitude, latitude] = coordinates;
  const exit = {
    sourceObjectId,
    sourceChecksum,
    label: exitLabel(sourceExitCode),
    lastUpdated: sourceDate(feature.properties.FMEL_UPD_D),
    geo: { latitude, longitude },
  };
  const exits = exitsByStationId.get(station.value.id) ?? [];
  exits.push(exit);
  exitsByStationId.set(station.value.id, exits);
}

if (unmatchedSourceStations.size > 0) {
  throw new Error(
    `Unmatched LTA station names:\n${[...unmatchedSourceStations].sort().join('\n')}`,
  );
}

const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});
let stationsWithLayouts = 0;
let changedFiles = 0;
for (const station of stations) {
  const exits = exitsByStationId.get(station.value.id);
  const platforms = station.value.layout?.platforms;
  if (exits) {
    exits.sort(
      (left, right) =>
        collator.compare(left.label, right.label) ||
        left.sourceObjectId - right.sourceObjectId,
    );
    station.value.layout = {
      sourceId: SOURCE_ID,
      exits,
      ...(platforms ? { platforms } : {}),
    };
    stationsWithLayouts += 1;
  } else if (platforms) {
    station.value.layout = { platforms };
  } else {
    delete station.value.layout;
  }

  const output = `${JSON.stringify(station.value, null, 2)}\n`;
  const current = await readFile(station.path, 'utf8');
  if (output !== current) {
    await writeFile(station.path, output);
    changedFiles += 1;
  }
}

const importedExitCount = [...exitsByStationId.values()].reduce(
  (total, exits) => total + exits.length,
  0,
);
if (importedExitCount !== geojson.features.length) {
  throw new Error(
    `Imported ${importedExitCount} of ${geojson.features.length} LTA features`,
  );
}

console.log(
  JSON.stringify(
    {
      source: basename(geojsonPath),
      sourceFeatures: geojson.features.length,
      importedExits: importedExitCount,
      stationsWithLayouts,
      changedFiles,
    },
    null,
    2,
  ),
);
