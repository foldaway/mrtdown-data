import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultGeneratedRoot = resolve(repoRoot, 'fixtures/generated');
const defaultDataDir = resolve(defaultGeneratedRoot, 'data');
const defaultMetaPath = resolve(defaultGeneratedRoot, 'meta.json');
const localeKeys = ['en-SG', 'zh-Hans', 'ms', 'ta'];
const hkTimeZone = 'Asia/Hong_Kong';

function translations(name) {
  return Object.fromEntries(
    localeKeys.map((key) => [key, key === 'en-SG' ? name : null]),
  );
}

function getFixtureDate(now) {
  const dateTime =
    now == null ? DateTime.now() : DateTime.fromISO(now, { zone: hkTimeZone });
  return dateTime.setZone(hkTimeZone).toISODate();
}

function addDays(date, days) {
  return DateTime.fromISO(date, { zone: hkTimeZone })
    .plus({ days })
    .toISODate();
}

function nextDayOfWeek(date, targetDay) {
  const weekday = DateTime.fromISO(date, { zone: hkTimeZone }).weekday % 7;
  const offset = (targetDay - weekday + 7) % 7;
  return addDays(date, offset);
}

function timestamp(date, time = '07:00:00') {
  return DateTime.fromISO(`${date}T${time}`, { zone: hkTimeZone }).toISO({
    suppressMilliseconds: true,
  });
}

function issueId(date, slug) {
  return `${date}-${slug}`;
}

function fixtureEvidenceId(sequence) {
  return `ev_01K${String(sequence).padStart(23, '0')}`;
}

function issuePath(dataDir, id) {
  const [year, month] = id.split('-');
  return resolve(dataDir, 'issue', year, month, id);
}

function isPathWithin(parent, child) {
  const relativePath = relative(parent, child);
  return (
    relativePath === '' ||
    (!!relativePath &&
      !relativePath.startsWith('..') &&
      !isAbsolute(relativePath))
  );
}

function assertGeneratedOutputPath(path, label) {
  if (!isPathWithin(defaultGeneratedRoot, path)) {
    throw new Error(
      `${label} must be under fixtures/generated so fixture cleanup stays sandboxed: ${path}`,
    );
  }
}

function assertSafeDataDir(dataDir) {
  assertGeneratedOutputPath(dataDir, 'dataDir');
  if (dataDir === defaultGeneratedRoot) {
    throw new Error(
      `dataDir must be a child of fixtures/generated, not the generated root itself: ${dataDir}`,
    );
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeNdjson(path, values) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${values.map((value) => JSON.stringify(value)).join('\n')}\n`,
  );
}

async function writeEntitySet(dataDir, type, values) {
  for (const value of values) {
    await writeJson(resolve(dataDir, type, `${value.id}.json`), value);
  }
}

async function writeSourceRegistry(dataDir) {
  const sourceRegistry = JSON.parse(
    await readFile(
      resolve(repoRoot, 'data/rights/source-registry.json'),
      'utf8',
    ),
  );
  sourceRegistry.rules.push({
    id: 'fixture-example',
    label: 'Fixture example sources',
    match: {
      sourceUrlHost: ['example.com'],
    },
    category: 'mrtdown-authored',
    contentRights: 'CC-BY-4.0',
    mrtdownRights: 'CC-BY-4.0',
    policy: 'mrtdown-authored-public-data',
    attributionTemplate: 'MRTDown fixture source {sourceUrl}',
    publicExportAllowed: true,
  });
  await writeJson(
    resolve(dataDir, 'rights', 'source-registry.json'),
    sourceRegistry,
  );
}

function service(id, name, lineId, stations) {
  return {
    id,
    name: translations(name),
    lineId,
    revisions: [
      {
        id: 'r_initial',
        startAt: '1979-10-01',
        endAt: null,
        path: {
          stations,
        },
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
    ],
  };
}

function station(
  id,
  name,
  lineCodes,
  latitude,
  longitude,
  townId,
  landmarkIds = [],
  firstLastTrain = undefined,
  options = {},
) {
  return {
    id,
    name: translations(name),
    geo: { latitude, longitude },
    stationCodes: lineCodes.map(
      ({ lineId, code, structureType = 'underground' }) => ({
        lineId,
        code,
        startedAt: '1979-10-01',
        endedAt: null,
        structureType,
      }),
    ),
    landmarkIds,
    townId,
    ...(options.address ? { address: options.address } : {}),
    ...(options.aliases ? { aliases: options.aliases } : {}),
    ...(firstLastTrain ? { firstLastTrain } : {}),
    ...(options.layout ? { layout: options.layout } : {}),
  };
}

function serviceEvents({
  evidenceId,
  issueKey,
  serviceId,
  ts,
  effect,
  scopes,
  periods,
  causes,
}) {
  return [
    {
      id: `ie_${issueKey}_${serviceId}_effect`,
      type: 'service_effects.set',
      entity: { type: 'service', serviceId },
      ts,
      effect,
      basis: { evidenceId },
    },
    {
      id: `ie_${issueKey}_${serviceId}_scope`,
      type: 'service_scopes.set',
      entity: { type: 'service', serviceId },
      ts,
      serviceScopes: scopes,
      basis: { evidenceId },
    },
    {
      id: `ie_${issueKey}_${serviceId}_periods`,
      type: 'periods.set',
      entity: { type: 'service', serviceId },
      ts,
      periods,
      basis: { evidenceId },
    },
    {
      id: `ie_${issueKey}_${serviceId}_causes`,
      type: 'causes.set',
      entity: { type: 'service', serviceId },
      ts,
      causes,
      basis: { evidenceId },
    },
  ];
}

async function writeIssue(dataDir, issue, evidence, impactEvents) {
  const dir = issuePath(dataDir, issue.id);
  await writeJson(resolve(dir, 'issue.json'), issue);
  await writeNdjson(resolve(dir, 'evidence.ndjson'), evidence);
  await writeNdjson(resolve(dir, 'impact.ndjson'), impactEvents);
}

function buildStaticEntities() {
  const operators = [
    {
      id: 'MTRC',
      name: translations('MTR Corporation'),
      foundedAt: '1975-09-26',
      url: 'https://www.mtr.com.hk/',
    },
  ];

  const lines = [
    {
      id: 'ISL',
      name: translations('Island Line'),
      type: 'mrt.high',
      color: '#007DC5',
      startedAt: '1985-05-31',
      serviceIds: ['ISL_MAIN_E', 'ISL_MAIN_W'],
      operators: [
        { operatorId: 'MTRC', startedAt: '1985-05-31', endedAt: null },
      ],
      operatingHours: {
        weekdays: { start: '05:30', end: '00:30' },
        weekends: { start: '05:30', end: '00:30' },
      },
    },
    {
      id: 'TWL',
      name: translations('Tsuen Wan Line'),
      type: 'mrt.high',
      color: '#E2231A',
      startedAt: '1982-05-10',
      serviceIds: ['TWL_MAIN_N', 'TWL_MAIN_S'],
      operators: [
        { operatorId: 'MTRC', startedAt: '1982-05-10', endedAt: null },
      ],
      operatingHours: {
        weekdays: { start: '05:30', end: '00:30' },
        weekends: { start: '05:30', end: '00:30' },
      },
    },
    {
      id: 'TKL',
      name: translations('Tseung Kwan O Line'),
      type: 'mrt.high',
      color: '#7D499D',
      startedAt: '2002-08-18',
      serviceIds: ['TKL_MAIN_N', 'TKL_MAIN_S'],
      operators: [
        { operatorId: 'MTRC', startedAt: '2002-08-18', endedAt: null },
      ],
      operatingHours: {
        weekdays: { start: '05:30', end: '00:30' },
        weekends: { start: '05:30', end: '00:30' },
      },
    },
  ];

  const towns = [
    ['central-western', 'Central and Western'],
    ['wan-chai', 'Wan Chai'],
    ['eastern', 'Eastern'],
    ['tsuen-wan', 'Tsuen Wan'],
    ['kwai-tsing', 'Kwai Tsing'],
    ['sham-shui-po', 'Sham Shui Po'],
    ['yau-tsim-mong', 'Yau Tsim Mong'],
    ['kwun-tong', 'Kwun Tong'],
    ['sai-kung', 'Sai Kung'],
  ].map(([id, name]) => ({ id, name: translations(name) }));

  const landmarks = [
    ['ifc-mall', 'IFC Mall'],
    ['hong-kong-park', 'Hong Kong Park'],
    ['times-square-hk', 'Times Square Hong Kong'],
    ['victoria-park', 'Victoria Park'],
    ['cityplaza', 'Cityplaza'],
    ['tsuen-wan-park', 'Tsuen Wan Park'],
    ['langham-place', 'Langham Place'],
    ['temple-street-market', 'Temple Street Market'],
    ['apm-mall', 'apm Mall'],
    ['popcorn-mall', 'PopCorn'],
  ].map(([id, name]) => ({ id, name: translations(name) }));

  const stations = [
    station(
      'KET',
      'Kennedy Town',
      [{ lineId: 'ISL', code: 'ISL1' }],
      22.2813,
      114.1286,
      'central-western',
      [],
      {
        services: [
          {
            serviceId: 'ISL_MAIN_E',
            times: {
              weekday: {
                firstTrain: '06:00',
                lastTrain: '00:50',
              },
              saturday: {
                firstTrain: '06:05',
                lastTrain: null,
              },
            },
          },
          {
            serviceId: 'ISL_MAIN_W',
            times: {
              weekday: {
                firstTrain: null,
                lastTrain: '00:35',
              },
            },
          },
        ],
      },
      {
        address: {
          streetAddress: 'Rock Hill Street',
          addressLocality: 'Hong Kong',
          addressCountry: 'HK',
        },
        aliases: ['Kennedy Town MTR', 'Kennedy Town Station', 'ISL1'],
        layout: {
          levels: [
            {
              id: 'B2',
              index: -2,
              lastUpdated: '2026-07-18',
              name: translations('Platforms'),
            },
          ],
          exits: [
            {
              id: 'KET_EXIT_A',
              label: 'A',
              lastUpdated: '2026-07-18',
              levelId: 'B2',
              roadNames: ['Rock Hill Street'],
              paidArea: false,
              accessibility: {
                stepFree: true,
                lift: true,
              },
            },
          ],
          platforms: [
            {
              id: 'KET_ISL_E',
              label: '1',
              lastUpdated: '2026-07-18',
              lineId: 'ISL',
              levelId: 'B2',
              serviceIds: ['ISL_MAIN_E'],
              doorCount: 24,
              accessPoints: [
                {
                  id: 'KET_ISL_E_LIFT_01',
                  kind: 'lift',
                  lastUpdated: '2026-07-18',
                  nearestDoor: '12',
                  position: 'middle',
                  connectsToLevelId: 'B2',
                  direction: 'bidirectional',
                },
              ],
            },
            {
              id: 'KET_ISL_W',
              label: '2',
              lastUpdated: '2026-07-18',
              lineId: 'ISL',
              levelId: 'B2',
              serviceIds: ['ISL_MAIN_W'],
              doorCount: 24,
              accessPoints: [],
            },
          ],
          transferPaths: [
            {
              id: 'KET_ISL_CROSS_PLATFORM',
              lastUpdated: '2026-07-18',
              from: {
                kind: 'platform',
                id: 'KET_ISL_E',
                lastUpdated: '2026-07-18',
              },
              to: {
                kind: 'platform',
                id: 'KET_ISL_W',
                lastUpdated: '2026-07-18',
              },
              paidArea: true,
              modes: ['walk'],
              levelChange: 0,
              classification: 'same_platform',
              estimatedTraversalSeconds: null,
              distanceMeters: null,
            },
          ],
        },
      },
    ),
    station(
      'HKU',
      'HKU',
      [{ lineId: 'ISL', code: 'ISL2' }],
      22.2839,
      114.1354,
      'central-western',
    ),
    station(
      'SYP',
      'Sai Ying Pun',
      [{ lineId: 'ISL', code: 'ISL3' }],
      22.2858,
      114.1422,
      'central-western',
    ),
    station(
      'SHW',
      'Sheung Wan',
      [{ lineId: 'ISL', code: 'ISL4' }],
      22.2868,
      114.1524,
      'central-western',
    ),
    station(
      'CEN',
      'Central',
      [
        { lineId: 'ISL', code: 'ISL5' },
        { lineId: 'TWL', code: 'TWL16' },
      ],
      22.2819,
      114.1581,
      'central-western',
      ['ifc-mall'],
    ),
    station(
      'ADM',
      'Admiralty',
      [
        { lineId: 'ISL', code: 'ISL6' },
        { lineId: 'TWL', code: 'TWL15' },
      ],
      22.2796,
      114.1656,
      'central-western',
      ['hong-kong-park'],
    ),
    station(
      'WAC',
      'Wan Chai',
      [{ lineId: 'ISL', code: 'ISL7' }],
      22.277,
      114.1722,
      'wan-chai',
    ),
    station(
      'CAB',
      'Causeway Bay',
      [{ lineId: 'ISL', code: 'ISL8' }],
      22.2802,
      114.1849,
      'wan-chai',
      ['times-square-hk', 'victoria-park'],
    ),
    station(
      'NOP',
      'North Point',
      [
        { lineId: 'ISL', code: 'ISL9' },
        { lineId: 'TKL', code: 'TKL1' },
      ],
      22.2912,
      114.2007,
      'eastern',
    ),
    station(
      'QUB',
      'Quarry Bay',
      [
        { lineId: 'ISL', code: 'ISL10' },
        { lineId: 'TKL', code: 'TKL2' },
      ],
      22.2887,
      114.2097,
      'eastern',
    ),
    station(
      'TAK',
      'Tai Koo',
      [{ lineId: 'ISL', code: 'ISL11' }],
      22.2847,
      114.2166,
      'eastern',
      ['cityplaza'],
    ),
    station(
      'SKW',
      'Shau Kei Wan',
      [{ lineId: 'ISL', code: 'ISL12' }],
      22.2795,
      114.228,
      'eastern',
    ),
    station(
      'CHW',
      'Chai Wan',
      [{ lineId: 'ISL', code: 'ISL13' }],
      22.2646,
      114.237,
      'eastern',
    ),
    station(
      'TSW',
      'Tsuen Wan',
      [{ lineId: 'TWL', code: 'TWL1' }],
      22.3734,
      114.1178,
      'tsuen-wan',
      ['tsuen-wan-park'],
    ),
    station(
      'KWF',
      'Kwai Fong',
      [{ lineId: 'TWL', code: 'TWL3' }],
      22.3569,
      114.1278,
      'kwai-tsing',
    ),
    station(
      'LAK',
      'Lai King',
      [{ lineId: 'TWL', code: 'TWL5' }],
      22.3485,
      114.1269,
      'kwai-tsing',
    ),
    station(
      'MEF',
      'Mei Foo',
      [{ lineId: 'TWL', code: 'TWL7' }],
      22.3377,
      114.1384,
      'sham-shui-po',
    ),
    station(
      'SSP',
      'Sham Shui Po',
      [{ lineId: 'TWL', code: 'TWL9' }],
      22.3308,
      114.1622,
      'sham-shui-po',
    ),
    station(
      'PRE',
      'Prince Edward',
      [{ lineId: 'TWL', code: 'TWL11' }],
      22.3246,
      114.1681,
      'yau-tsim-mong',
    ),
    station(
      'MOK',
      'Mong Kok',
      [{ lineId: 'TWL', code: 'TWL12' }],
      22.3193,
      114.1694,
      'yau-tsim-mong',
      ['langham-place'],
    ),
    station(
      'YMT',
      'Yau Ma Tei',
      [{ lineId: 'TWL', code: 'TWL13' }],
      22.3132,
      114.1707,
      'yau-tsim-mong',
      ['temple-street-market'],
    ),
    station(
      'TST',
      'Tsim Sha Tsui',
      [{ lineId: 'TWL', code: 'TWL14' }],
      22.2972,
      114.1722,
      'yau-tsim-mong',
    ),
    station(
      'YAT',
      'Yau Tong',
      [{ lineId: 'TKL', code: 'TKL3' }],
      22.2979,
      114.2371,
      'kwun-tong',
    ),
    station(
      'TIK',
      'Tiu Keng Leng',
      [{ lineId: 'TKL', code: 'TKL4' }],
      22.3048,
      114.2524,
      'sai-kung',
    ),
    station(
      'TKO',
      'Tseung Kwan O',
      [{ lineId: 'TKL', code: 'TKL5' }],
      22.3075,
      114.2608,
      'sai-kung',
      ['popcorn-mall'],
    ),
    station(
      'HAH',
      'Hang Hau',
      [{ lineId: 'TKL', code: 'TKL6' }],
      22.3155,
      114.2648,
      'sai-kung',
    ),
    station(
      'POL',
      'Po Lam',
      [{ lineId: 'TKL', code: 'TKL7' }],
      22.3225,
      114.2578,
      'sai-kung',
    ),
    station(
      'LHP',
      'LOHAS Park',
      [{ lineId: 'TKL', code: 'TKL8' }],
      22.2952,
      114.2686,
      'sai-kung',
    ),
  ];

  const islandEast = [
    'KET',
    'HKU',
    'SYP',
    'SHW',
    'CEN',
    'ADM',
    'WAC',
    'CAB',
    'NOP',
    'QUB',
    'TAK',
    'SKW',
    'CHW',
  ];
  const tsuenWanSouth = [
    'TSW',
    'KWF',
    'LAK',
    'MEF',
    'SSP',
    'PRE',
    'MOK',
    'YMT',
    'TST',
    'ADM',
    'CEN',
  ];
  const tseungKwanONorth = ['NOP', 'QUB', 'YAT', 'TIK', 'TKO', 'HAH', 'POL'];
  const stationCodesByLine = Object.fromEntries(
    stations.flatMap((item) =>
      item.stationCodes.map((code) => [`${item.id}:${code.lineId}`, code.code]),
    ),
  );
  const serviceStations = (ids, lineId) =>
    ids.map((stationId) => ({
      stationId,
      displayCode: stationCodesByLine[`${stationId}:${lineId}`],
    }));

  const services = [
    service(
      'ISL_MAIN_E',
      'Main Service - Eastbound',
      'ISL',
      serviceStations(islandEast, 'ISL'),
    ),
    service(
      'ISL_MAIN_W',
      'Main Service - Westbound',
      'ISL',
      serviceStations([...islandEast].reverse(), 'ISL'),
    ),
    service(
      'TWL_MAIN_S',
      'Main Service - Southbound',
      'TWL',
      serviceStations(tsuenWanSouth, 'TWL'),
    ),
    service(
      'TWL_MAIN_N',
      'Main Service - Northbound',
      'TWL',
      serviceStations([...tsuenWanSouth].reverse(), 'TWL'),
    ),
    service(
      'TKL_MAIN_N',
      'Main Service - Northbound',
      'TKL',
      serviceStations(tseungKwanONorth, 'TKL'),
    ),
    service(
      'TKL_MAIN_S',
      'Main Service - Southbound',
      'TKL',
      serviceStations([...tseungKwanONorth].reverse(), 'TKL'),
    ),
  ];

  return { operators, lines, towns, landmarks, stations, services };
}

function buildIssues(anchorDate) {
  const trainFaultDate = anchorDate;
  const maintenanceDate = addDays(anchorDate, 7);
  const infraDate = addDays(anchorDate, 14);
  const signalFaultDate = addDays(anchorDate, 30);
  const recurringStartDate = nextDayOfWeek(addDays(anchorDate, 60), 6);
  const recurringEndDate = addDays(recurringStartDate, 23);
  const recurringEvidenceDate = addDays(recurringStartDate, -20);
  const recurringExcludedDate = addDays(recurringStartDate, 14);
  const reducedServiceDate = addDays(anchorDate, 120);
  const reducedEvidenceDate = addDays(reducedServiceDate, -14);

  const trainFaultId = issueId(trainFaultDate, 'isl-train-fault');
  const trainFaultEvidenceId = fixtureEvidenceId(1);
  const trainFaultTs = timestamp(trainFaultDate);
  const trainFaultImpact = [
    ...serviceEvents({
      evidenceId: trainFaultEvidenceId,
      issueKey: 'isl_train_fault',
      serviceId: 'ISL_MAIN_E',
      ts: trainFaultTs,
      effect: { kind: 'delay', duration: null },
      scopes: [
        { type: 'service.segment', fromStationId: 'KET', toStationId: 'ADM' },
      ],
      periods: [{ kind: 'fixed', startAt: trainFaultTs, endAt: null }],
      causes: ['track.fault'],
    }),
    ...serviceEvents({
      evidenceId: trainFaultEvidenceId,
      issueKey: 'isl_train_fault',
      serviceId: 'ISL_MAIN_W',
      ts: trainFaultTs,
      effect: { kind: 'delay', duration: null },
      scopes: [
        { type: 'service.segment', fromStationId: 'ADM', toStationId: 'KET' },
      ],
      periods: [{ kind: 'fixed', startAt: trainFaultTs, endAt: null }],
      causes: ['track.fault'],
    }),
  ];

  const maintenanceId = issueId(maintenanceDate, 'isl-maintenance');
  const maintenanceEvidenceId = fixtureEvidenceId(2);
  const maintenanceEvidenceTs = timestamp(addDays(maintenanceDate, -6));
  const maintenanceImpact = ['ISL_MAIN_E', 'ISL_MAIN_W'].flatMap((serviceId) =>
    serviceEvents({
      evidenceId: maintenanceEvidenceId,
      issueKey: 'isl_maintenance',
      serviceId,
      ts: maintenanceEvidenceTs,
      effect: { kind: 'no-service' },
      scopes: [{ type: 'service.whole' }],
      periods: [
        {
          kind: 'fixed',
          startAt: timestamp(maintenanceDate, '00:00:00'),
          endAt: timestamp(addDays(maintenanceDate, 2), '00:00:00'),
        },
      ],
      causes: ['track.work'],
    }),
  );

  const infraId = issueId(infraDate, 'isl-platform-screen-door-renewal');
  const infraEvidenceId = fixtureEvidenceId(3);
  const infraTs = timestamp(infraDate, '09:00:00');
  const infraEntity = {
    type: 'facility',
    stationId: 'CAB',
    lineId: 'ISL',
    kind: 'screen-door',
  };
  const infraImpact = [
    {
      id: 'ie_isl_psd_effect',
      type: 'facility_effects.set',
      entity: infraEntity,
      ts: infraTs,
      effect: { kind: 'degraded' },
      basis: { evidenceId: infraEvidenceId },
    },
    {
      id: 'ie_isl_psd_periods',
      type: 'periods.set',
      entity: infraEntity,
      ts: infraTs,
      periods: [
        {
          kind: 'fixed',
          startAt: infraTs,
          endAt: timestamp(addDays(infraDate, 120), '23:59:00'),
        },
      ],
      basis: { evidenceId: infraEvidenceId },
    },
    {
      id: 'ie_isl_psd_causes',
      type: 'causes.set',
      entity: infraEntity,
      ts: infraTs,
      causes: ['station.renovation'],
      basis: { evidenceId: infraEvidenceId },
    },
  ];

  const signalFaultId = issueId(signalFaultDate, 'twl-signal-fault');
  const signalEvidenceId = fixtureEvidenceId(4);
  const signalTs = timestamp(signalFaultDate, '08:10:00');
  const signalImpact = [
    ...serviceEvents({
      evidenceId: signalEvidenceId,
      issueKey: 'twl_signal_fault',
      serviceId: 'TWL_MAIN_S',
      ts: signalTs,
      effect: { kind: 'delay', duration: 'PT15M' },
      scopes: [
        { type: 'service.segment', fromStationId: 'MOK', toStationId: 'ADM' },
      ],
      periods: [
        {
          kind: 'fixed',
          startAt: signalTs,
          endAt: timestamp(signalFaultDate, '10:30:00'),
        },
      ],
      causes: ['signal.fault'],
    }),
    ...serviceEvents({
      evidenceId: signalEvidenceId,
      issueKey: 'twl_signal_fault',
      serviceId: 'TWL_MAIN_N',
      ts: signalTs,
      effect: { kind: 'delay', duration: 'PT15M' },
      scopes: [
        { type: 'service.segment', fromStationId: 'ADM', toStationId: 'MOK' },
      ],
      periods: [
        {
          kind: 'fixed',
          startAt: signalTs,
          endAt: timestamp(signalFaultDate, '10:30:00'),
        },
      ],
      causes: ['signal.fault'],
    }),
  ];

  const lateOpeningId = issueId(
    recurringStartDate,
    'isl-weekend-late-openings',
  );
  const lateOpeningEvidenceId = fixtureEvidenceId(5);
  const lateOpeningTs = timestamp(recurringEvidenceDate, '12:00:00');
  const recurringPeriod = {
    kind: 'recurring',
    frequency: 'weekly',
    startAt: timestamp(recurringStartDate, '00:00:00'),
    endAt: timestamp(addDays(recurringEndDate, 1), '00:00:00'),
    daysOfWeek: ['SA', 'SU'],
    timeWindow: { startAt: '00:00:00', endAt: '10:00:00' },
    timeZone: hkTimeZone,
    excludedDates: [recurringExcludedDate],
  };
  const lateOpeningImpact = ['ISL_MAIN_E', 'ISL_MAIN_W'].flatMap((serviceId) =>
    serviceEvents({
      evidenceId: lateOpeningEvidenceId,
      issueKey: 'isl_late_openings',
      serviceId,
      ts: lateOpeningTs,
      effect: { kind: 'service-hours-adjustment' },
      scopes: [{ type: 'service.whole' }],
      periods: [recurringPeriod],
      causes: ['system.upgrade'],
    }),
  );

  const reducedServiceId = issueId(reducedServiceDate, 'tkl-reduced-service');
  const reducedEvidenceId = fixtureEvidenceId(6);
  const reducedEvidenceTs = timestamp(reducedEvidenceDate, '10:00:00');
  const reducedImpact = ['TKL_MAIN_N', 'TKL_MAIN_S'].flatMap((serviceId) =>
    serviceEvents({
      evidenceId: reducedEvidenceId,
      issueKey: 'tkl_reduced_service',
      serviceId,
      ts: reducedEvidenceTs,
      effect: { kind: 'reduced-service' },
      scopes: [
        {
          type: 'service.segment',
          fromStationId: serviceId === 'TKL_MAIN_N' ? 'NOP' : 'POL',
          toStationId: serviceId === 'TKL_MAIN_N' ? 'POL' : 'NOP',
        },
      ],
      periods: [
        {
          kind: 'fixed',
          startAt: timestamp(reducedServiceDate, '10:00:00'),
          endAt: timestamp(reducedServiceDate, '15:00:00'),
        },
      ],
      causes: ['track.work'],
    }),
  );

  const issues = [
    {
      issue: {
        id: trainFaultId,
        type: 'disruption',
        title: translations('Island Line Train Fault'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: trainFaultEvidenceId,
          ts: trainFaultTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/isl-train-fault',
          text: '[ISL] Due to a track fault at HKU, train services on the Island Line are delayed between Kennedy Town and Admiralty.',
          render: null,
        },
      ],
      impact: trainFaultImpact,
    },
    {
      issue: {
        id: maintenanceId,
        type: 'maintenance',
        title: translations('Island Line Maintenance'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: maintenanceEvidenceId,
          ts: maintenanceEvidenceTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/isl-maintenance',
          text: `[ISL] The Island Line will be closed for maintenance on Sat & Sun from ${maintenanceDate} to ${addDays(maintenanceDate, 1)}.`,
          render: null,
        },
      ],
      impact: maintenanceImpact,
    },
    {
      issue: {
        id: infraId,
        type: 'infra',
        title: translations('Island Line Platform Screen Door Renewal'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: infraEvidenceId,
          ts: infraTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/isl-psd-renewal',
          text: `[ISL] Platform screen doors at Causeway Bay will undergo renewal works from ${infraDate}. Some doors may be unavailable during works.`,
          render: null,
        },
      ],
      impact: infraImpact,
    },
    {
      issue: {
        id: signalFaultId,
        type: 'disruption',
        title: translations('Tsuen Wan Line Signal Fault'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: signalEvidenceId,
          ts: signalTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/twl-signal-fault',
          text: '[TWL] Due to a signal fault, train services on the Tsuen Wan Line are delayed between Mong Kok and Admiralty.',
          render: null,
        },
      ],
      impact: signalImpact,
    },
    {
      issue: {
        id: lateOpeningId,
        type: 'maintenance',
        title: translations('Island Line Weekend Late Openings'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: lateOpeningEvidenceId,
          ts: lateOpeningTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/isl-late-openings',
          text: `[ISL] Island Line train services will start at 10am on weekends from ${recurringStartDate} to ${recurringEndDate} for systems upgrading works, except ${recurringExcludedDate}.`,
          render: null,
        },
      ],
      impact: lateOpeningImpact,
    },
    {
      issue: {
        id: reducedServiceId,
        type: 'maintenance',
        title: translations('Tseung Kwan O Line Reduced Service'),
        titleMeta: { source: 'generated-fixture' },
      },
      evidence: [
        {
          id: reducedEvidenceId,
          ts: reducedEvidenceTs,
          type: 'statement.official',
          sourceUrl: 'https://example.com/mtr/tkl-reduced-service',
          text: `[TKL] Trains will run at longer intervals between North Point and Po Lam on ${reducedServiceDate} from 10am to 3pm due to track works.`,
          render: null,
        },
      ],
      impact: reducedImpact,
    },
  ];

  return {
    issues,
    meta: {
      anchorDate,
      issueOrder: issues.map((item) => item.issue.id),
      issues: {
        trainFault: {
          id: trainFaultId,
          date: trainFaultDate,
          timestamp: trainFaultTs,
          title: 'Island Line Train Fault',
          serviceIds: ['ISL_MAIN_E', 'ISL_MAIN_W'],
          segment: { fromStationId: 'KET', toStationId: 'ADM' },
        },
        maintenance: { id: maintenanceId, date: maintenanceDate },
        infra: { id: infraId, date: infraDate },
        signalFault: { id: signalFaultId, date: signalFaultDate },
        lateOpenings: {
          id: lateOpeningId,
          date: recurringStartDate,
          scheduledTimestamp: timestamp(recurringStartDate, '09:00:00'),
          betweenOccurrencesTimestamp: timestamp(
            addDays(recurringStartDate, 3),
            '09:00:00',
          ),
        },
        reducedService: { id: reducedServiceId, date: reducedServiceDate },
      },
      stations: {
        primary: { id: 'KET', name: 'Kennedy Town' },
      },
    },
  };
}

export async function generateFixtures(options = {}) {
  const dataDir = options.dataDir ?? defaultDataDir;
  const metaPath = options.metaPath ?? defaultMetaPath;
  assertSafeDataDir(dataDir);
  assertGeneratedOutputPath(metaPath, 'metaPath');

  const anchorDate = getFixtureDate(
    options.now ?? process.env.MRTDOWN_FIXTURE_NOW,
  );
  const staticEntities = buildStaticEntities();
  const { issues, meta } = buildIssues(anchorDate);

  await rm(dataDir, { recursive: true, force: true });
  await rm(metaPath, { force: true });
  await mkdir(dataDir, { recursive: true });

  await writeEntitySet(dataDir, 'operator', staticEntities.operators);
  await writeEntitySet(dataDir, 'line', staticEntities.lines);
  await writeEntitySet(dataDir, 'town', staticEntities.towns);
  await writeEntitySet(dataDir, 'landmark', staticEntities.landmarks);
  await writeEntitySet(dataDir, 'station', staticEntities.stations);
  await writeEntitySet(dataDir, 'service', staticEntities.services);
  await writeSourceRegistry(dataDir);

  for (const item of issues) {
    await writeIssue(dataDir, item.issue, item.evidence, item.impact);
  }

  const fullMeta = {
    ...meta,
    dataDir,
    counts: {
      issue: issues.length,
      landmark: staticEntities.landmarks.length,
      line: staticEntities.lines.length,
      operator: staticEntities.operators.length,
      rights: 1,
      service: staticEntities.services.length,
      station: staticEntities.stations.length,
      town: staticEntities.towns.length,
    },
  };
  await writeJson(metaPath, fullMeta);
  return fullMeta;
}

function usage() {
  return `Usage:
  node scripts/generate-fixtures.mjs [--data-dir <path>] [--meta-path <path>]

Defaults:
  --data-dir fixtures/generated/data
  --meta-path fixtures/generated/meta.json

Custom output paths must stay under fixtures/generated.
`;
}

function parseArgs(argv) {
  const options = {};
  const args = [...argv];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--help' || arg === '-h') {
      return { ...options, help: true };
    }

    if (arg !== '--data-dir' && arg !== '--meta-path') {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = args.shift();
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value`);
    }

    if (arg === '--data-dir') {
      options.dataDir = resolve(repoRoot, value);
    } else {
      options.metaPath = resolve(repoRoot, value);
    }
  }

  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trimEnd());
  } else {
    const meta = await generateFixtures(options);
    console.log(`Generated HK MTR fixtures at ${meta.dataDir}`);
  }
}
