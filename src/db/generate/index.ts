import { computeIssueIntervals } from '../../helpers/computeIssueIntervals.js';
import { ComponentModel } from '../../model/ComponentModel.js';
import { IssueModel } from '../../model/IssueModel.js';
import { StationModel } from '../../model/StationModel.js';
import {
  IssueDisruptionSubtypeSchema,
  IssueInfraSubtypeSchema,
  IssueMaintenanceSubtypeSchema,
  IssueTypeSchema,
} from '../../schema/Issue.js';
import { assert } from '../../util/assert.js';
import { connect } from '../connect.js';

const connection = await connect({
  access_mode: 'READ_WRITE',
});

await connection.run('BEGIN TRANSACTION');

await connection.run(`
  PRAGMA enable_object_cache;

  DROP TABLE IF EXISTS public_holidays;
  DROP TABLE IF EXISTS issue_updates;
  DROP TABLE IF EXISTS issue_issue_subtypes;
  DROP TABLE IF EXISTS station_landmarks;
  DROP TABLE IF EXISTS landmarks;
  DROP TABLE IF EXISTS issue_stations;
  DROP TABLE IF EXISTS issue_components;
  DROP TABLE IF EXISTS issue_intervals;
  DROP TABLE IF EXISTS issues;
  DROP TABLE IF EXISTS issue_subtypes;
  DROP TABLE IF EXISTS issue_types;
  DROP TABLE IF EXISTS component_branch_memberships;
  DROP TABLE IF EXISTS stations;
  DROP TABLE IF EXISTS towns;
  DROP TABLE IF EXISTS branches;
  DROP TABLE IF EXISTS components;
  DROP TABLE IF EXISTS metadata;

  CREATE TABLE public_holidays AS SELECT * FROM read_json_auto('data/source/public_holidays.json');

  CREATE TABLE components (
    id TEXT PRIMARY KEY,
    title TEXT,
    title_translations JSON,
    type TEXT,
    color TEXT,
    started_at DATE,
    weekday_start TIME,
    weekday_end TIME,
    weekend_start TIME,
    weekend_end TIME
  );

  CREATE TABLE branches (
    id TEXT,
    component_id TEXT REFERENCES components(id),
    title TEXT,
    title_translations JSON,
    started_at DATE,
    ended_at DATE,
    PRIMARY KEY (id, component_id)
  );

  CREATE TABLE towns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_translations JSON
  );

  CREATE TABLE stations (
    id TEXT PRIMARY KEY,
    name TEXT,
    name_translations JSON,
    town_id TEXT REFERENCES towns(id),
    geo_lat DOUBLE,
    geo_lon DOUBLE
  );

  CREATE TABLE component_branch_memberships (
    component_id TEXT,
    branch_id TEXT,
    station_id TEXT,
    code TEXT,
    started_at DATE,
    ended_at DATE,
    structure_type TEXT,
    sequence_order INTEGER,
    PRIMARY KEY (component_id, branch_id, station_id, code, sequence_order)
  );

  CREATE TABLE issue_types (
    type TEXT PRIMARY KEY
  );

  CREATE TABLE issue_subtypes (
    subtype TEXT PRIMARY KEY,
    issue_type TEXT REFERENCES issue_types(type)
  );

  CREATE TABLE issues (
    id TEXT PRIMARY KEY,
    title TEXT,
    title_translations JSON,
    type TEXT REFERENCES issue_types(type)
  );

  CREATE TABLE issue_intervals (
    issue_id TEXT REFERENCES issues(id),
    start_at TIMESTAMPTZ,
    end_at   TIMESTAMPTZ
  );

  CREATE TABLE issue_components (
    issue_id TEXT,
    component_id TEXT
  );

  CREATE TABLE issue_stations (
    issue_id TEXT,
    component_id TEXT,
    branch_id TEXT,
    station_id TEXT
  );

  CREATE TABLE issue_issue_subtypes (
    issue_id TEXT REFERENCES issues(id),
    subtype TEXT REFERENCES issue_subtypes(subtype)
  );

  CREATE TABLE issue_updates (
    issue_id TEXT,
    type TEXT,
    text TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ
  );

  CREATE TABLE landmarks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_translations JSON
  );

  CREATE TABLE station_landmarks (
    station_id TEXT REFERENCES stations(id),
    landmark_id TEXT REFERENCES landmarks(id),
    landmark_order INTEGER,
    PRIMARY KEY (station_id, landmark_id)
  );

  CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Insert issue types
const issueTypes = Object.values(IssueTypeSchema.enum);
if (issueTypes.length > 0) {
  const placeholders = issueTypes.map(() => '(?)').join(', ');
  await connection.run(
    `INSERT INTO issue_types VALUES ${placeholders}`,
    issueTypes,
  );
}

// Insert issue subtypes
const allSubtypes = [
  ...Object.values(IssueDisruptionSubtypeSchema.enum).map((s) => [
    s,
    'disruption',
  ]),
  ...Object.values(IssueMaintenanceSubtypeSchema.enum).map((s) => [
    s,
    'maintenance',
  ]),
  ...Object.values(IssueInfraSubtypeSchema.enum).map((s) => [s, 'infra']),
];

if (allSubtypes.length > 0) {
  const placeholders = allSubtypes.map(() => '(?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_subtypes VALUES ${placeholders}`,
    allSubtypes.flat(),
  );
}

const components = ComponentModel.getAll();
const branchMemberMetadataByComponentAndStationCode: Record<
  string,
  {
    branchId: string;
    sequenceOrder: number;
  }[]
> = {};

// Prepare batch data
const componentRows: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
][] = [];
const branchRows: [
  string,
  string,
  string,
  string,
  string | null,
  string | null,
][] = [];

for (const component of components) {
  componentRows.push([
    component.id,
    component.title,
    JSON.stringify(component.title_translations),
    component.type,
    component.color,
    component.startedAt,
    component.operatingHours.weekdays.start,
    component.operatingHours.weekdays.end,
    component.operatingHours.weekends.start,
    component.operatingHours.weekends.end,
  ]);

  for (const [branchId, branch] of Object.entries(component.branches)) {
    branchRows.push([
      branchId,
      component.id,
      branch.title,
      JSON.stringify(branch.title_translations),
      branch.startedAt,
      branch.endedAt,
    ]);

    for (const [index, code] of branch.stationCodes.entries()) {
      const key = `${code}@${component.id}`;
      branchMemberMetadataByComponentAndStationCode[key] ??= [];
      branchMemberMetadataByComponentAndStationCode[key].push({
        branchId,
        sequenceOrder: index,
      });
    }
  }
}

// Batch insert components
if (componentRows.length > 0) {
  const placeholders = componentRows
    .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .join(', ');
  await connection.run(
    `INSERT INTO components VALUES ${placeholders}`,
    componentRows.flat(),
  );
}

// Batch insert branches
if (branchRows.length > 0) {
  const placeholders = branchRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO branches VALUES ${placeholders}`,
    branchRows.flat(),
  );
}

// Process towns from stations
const townMap = new Map<
  string,
  { name: string; translations: Record<string, string> }
>();
const stations = StationModel.getAll();

for (const station of stations) {
  if (station.town) {
    const townId = station.town.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!townMap.has(townId)) {
      townMap.set(townId, {
        name: station.town,
        translations: station.town_translations || {},
      });
    }
  }
}

// Insert towns
const townRows = Array.from(townMap.entries()).map(([townId, town]) => [
  townId,
  town.name,
  JSON.stringify(town.translations),
]);

if (townRows.length > 0) {
  const placeholders = townRows.map(() => '(?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO towns VALUES ${placeholders}`,
    townRows.flat(),
  );
}

// Prepare batch data for stations and memberships
const stationInsertRows: [
  string,
  string,
  string,
  string | null,
  number,
  number,
][] = [];
const membershipRows: [
  string,
  string | null,
  string,
  string,
  string,
  string | null,
  string,
  number | null,
][] = [];

for (const station of stations) {
  const townId = station.town
    ? station.town.toLowerCase().replace(/[^a-z0-9]/g, '_')
    : null;

  stationInsertRows.push([
    station.id,
    station.name,
    JSON.stringify(station.name_translations),
    townId,
    station.geo.latitude,
    station.geo.longitude,
  ]);

  for (const [compId, memberships] of Object.entries(
    station.componentMembers,
  )) {
    for (const m of memberships) {
      const key = `${m.code}@${compId}`;
      const branchMemberMetadatas =
        branchMemberMetadataByComponentAndStationCode[key] ?? null;
      if (branchMemberMetadatas == null) {
        continue;
      }
      for (const branchMemberMetadata of branchMemberMetadatas) {
        membershipRows.push([
          compId,
          branchMemberMetadata?.branchId ?? null,
          station.id,
          m.code,
          m.startedAt,
          m.endedAt ?? null,
          m.structureType,
          branchMemberMetadata?.sequenceOrder ?? null,
        ]);
      }
    }
  }
}

// Batch insert stations
if (stationInsertRows.length > 0) {
  const placeholders = stationInsertRows
    .map(() => '(?, ?, ?, ?, ?, ?)')
    .join(', ');
  await connection.run(
    `INSERT INTO stations VALUES ${placeholders}`,
    stationInsertRows.flat(),
  );
}

// Batch insert component memberships
if (membershipRows.length > 0) {
  const placeholders = membershipRows
    .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
    .join(', ');
  await connection.run(
    `INSERT INTO component_branch_memberships VALUES ${placeholders}`,
    membershipRows.flat(),
  );
}

// Process landmarks from stations
const landmarkMap = new Map<
  string,
  { name: string; translations: Record<string, string> }
>();
const stationLandmarks: {
  stationId: string;
  landmarkId: string;
  order: number;
}[] = [];

for (const station of stations) {
  if (station.landmarks && station.landmarks.length > 0) {
    for (let i = 0; i < station.landmarks.length; i++) {
      const landmarkName = station.landmarks[i];
      // Create a simple ID from the landmark name
      const landmarkId = landmarkName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      // Collect translations for this landmark
      const translations: Record<string, string> = {};
      for (const [lang, translatedLandmarks] of Object.entries(
        station.landmarks_translations || {},
      )) {
        if (translatedLandmarks[i] != null) {
          translations[lang] = translatedLandmarks[i];
        }
      }

      // Store unique landmarks
      if (!landmarkMap.has(landmarkId)) {
        landmarkMap.set(landmarkId, { name: landmarkName, translations });
      }

      // Store station-landmark relationship
      stationLandmarks.push({
        stationId: station.id,
        landmarkId,
        order: i,
      });
    }
  }
}

// Insert landmarks
const landmarkRows = Array.from(landmarkMap.entries()).map(
  ([landmarkId, landmark]) => [
    landmarkId,
    landmark.name,
    JSON.stringify(landmark.translations),
  ],
);

if (landmarkRows.length > 0) {
  const placeholders = landmarkRows.map(() => '(?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO landmarks VALUES ${placeholders}`,
    landmarkRows.flat(),
  );
}

// Insert station-landmark relationships
if (stationLandmarks.length > 0) {
  const placeholders = stationLandmarks.map(() => '(?, ?, ?)').join(', ');
  const flatData = stationLandmarks.flatMap((sl) => [
    sl.stationId,
    sl.landmarkId,
    sl.order,
  ]);
  await connection.run(
    `INSERT INTO station_landmarks VALUES ${placeholders}`,
    flatData,
  );
}

// Add performance indexes
await connection.run(`
  CREATE INDEX idx_issue_intervals_issue_id ON issue_intervals(issue_id);
  CREATE INDEX idx_issue_intervals_times ON issue_intervals(start_at, end_at);
  CREATE INDEX idx_issue_components_issue_id ON issue_components(issue_id);
  CREATE INDEX idx_issue_components_component_id ON issue_components(component_id);
  CREATE INDEX idx_issues_type ON issues(type);
  CREATE INDEX idx_public_holidays_date ON public_holidays(date);
  CREATE INDEX idx_components_started_at ON components(started_at);
  CREATE INDEX idx_issue_stations_issue_id ON issue_stations(issue_id);
  CREATE INDEX idx_issue_stations_component_id ON issue_stations(component_id);
  CREATE INDEX idx_issue_types_type ON issue_types(type);
  CREATE INDEX idx_issue_subtypes_subtype ON issue_subtypes(subtype);
  CREATE INDEX idx_issue_subtypes_issue_type ON issue_subtypes(issue_type);
  CREATE INDEX idx_issue_issue_subtypes_issue_id ON issue_issue_subtypes(issue_id);
  CREATE INDEX idx_issue_issue_subtypes_subtype ON issue_issue_subtypes(subtype);
  CREATE INDEX idx_station_landmarks_station_id ON station_landmarks(station_id);
  CREATE INDEX idx_station_landmarks_landmark_id ON station_landmarks(landmark_id);
  CREATE INDEX idx_stations_town_id ON stations(town_id);
`);

// Insert generation timestamp
await connection.run(
  // biome-ignore lint/style/noUnusedTemplateLiteral: Using template literal for SQL statement formatting and readability, even though no interpolation is used.
  `INSERT INTO metadata (key, value) VALUES (?, ?)`,
  ['db_generated_at', new Date().toISOString()],
);

await connection.run('COMMIT');

const issues = IssueModel.getAll();

// Prepare all batch data for issues
const issueRows: [string, string, string, string][] = [];
const intervalRows: [string, string, string | null][] = [];
const issueComponentRows: [string, string][] = [];
const issueStationRows: [string, string, string, string][] = [];
const updateRows: [string, string, string, string, string][] = [];
const subtypeRows: [string, string][] = [];

for (const issue of issues) {
  issueRows.push([
    issue.id,
    issue.title,
    JSON.stringify(issue.title_translations),
    issue.type,
  ]);

  const intervals = computeIssueIntervals(issue);
  if (intervals.length > 0) {
    for (const interval of intervals) {
      const { start, end } = interval;
      assert(start != null);
      intervalRows.push([issue.id, start.toISO(), end?.toISO?.() ?? null]);
    }
  } else {
    intervalRows.push([issue.id, issue.startAt, null]);
  }

  for (const compId of issue.componentIdsAffected) {
    issueComponentRows.push([issue.id, compId]);
  }

  for (const st of issue.stationIdsAffected) {
    for (const s of st.stationIds) {
      issueStationRows.push([issue.id, st.componentId, st.branchName, s]);
    }
  }

  for (const u of issue.updates) {
    updateRows.push([issue.id, u.type, u.text, u.sourceUrl, u.createdAt]);
  }

  for (const subtype of issue.subtypes) {
    subtypeRows.push([issue.id, subtype]);
  }
}

// Batch insert all issue data
if (issueRows.length > 0) {
  const placeholders = issueRows.map(() => '(?, ?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issues VALUES ${placeholders}`,
    issueRows.flat(),
  );
}

if (intervalRows.length > 0) {
  const placeholders = intervalRows.map(() => '(?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_intervals VALUES ${placeholders}`,
    intervalRows.flat(),
  );
}

if (issueComponentRows.length > 0) {
  const placeholders = issueComponentRows.map(() => '(?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_components VALUES ${placeholders}`,
    issueComponentRows.flat(),
  );
}

if (issueStationRows.length > 0) {
  const placeholders = issueStationRows.map(() => '(?, ?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_stations VALUES ${placeholders}`,
    issueStationRows.flat(),
  );
}

if (updateRows.length > 0) {
  const placeholders = updateRows.map(() => '(?, ?, ?, ?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_updates VALUES ${placeholders}`,
    updateRows.flat(),
  );
}

if (subtypeRows.length > 0) {
  const placeholders = subtypeRows.map(() => '(?, ?)').join(', ');
  await connection.run(
    `INSERT INTO issue_issue_subtypes VALUES ${placeholders}`,
    subtypeRows.flat(),
  );
}
