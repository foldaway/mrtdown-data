import { ComponentModel } from '../../model/ComponentModel.js';
import { StationModel } from '../../model/StationModel.js';
import { IssueModel } from '../../model/IssueModel.js';
import { connect } from '../connect.js';
import { computeIssueIntervals } from '../../helpers/computeIssueIntervals.js';
import { assert } from '../../util/assert.js';
import { IssueTypeSchema } from '../../schema/Issue.js';

const connection = await connect({
  access_mode: 'READ_WRITE',
});

await connection.run(`
  PRAGMA enable_object_cache;

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

  CREATE TABLE stations (
    id TEXT PRIMARY KEY,
    name TEXT,
    name_translations JSON,
    town TEXT,
    town_translations JSON,
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

  CREATE TABLE issue_updates (
    issue_id TEXT,
    type TEXT,
    text TEXT,
    source_url TEXT,
    created_at TIMESTAMPTZ
  );
`);

// Insert issue types
const issueTypes = Object.values(IssueTypeSchema.enum);
for (const issueType of issueTypes) {
  await connection.run(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    `INSERT INTO issue_types VALUES (?)`,
    [issueType],
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

for (const component of components) {
  await connection.run(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    `INSERT INTO components VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );

  for (const [branchId, branch] of Object.entries(component.branches)) {
    await connection.run(
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      `INSERT INTO branches VALUES (?, ?, ?, ?, ?, ?)`,
      [
        branchId,
        component.id,
        branch.title,
        JSON.stringify(branch.title_translations),
        branch.startedAt,
        branch.endedAt,
      ],
    );

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

const stations = StationModel.getAll();
for (const station of stations) {
  await connection.run(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    `INSERT INTO stations VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      station.id,
      station.name,
      JSON.stringify(station.name_translations),
      station.town,
      JSON.stringify(station.town_translations),
      station.geo.latitude,
      station.geo.longitude,
    ],
  );
  for (const [compId, memberships] of Object.entries(
    station.componentMembers,
  )) {
    for (const m of memberships) {
      const key = `${m.code}@${compId}`;
      const branchMemberMetadatas =
        branchMemberMetadataByComponentAndStationCode[key] ?? null;
      if (branchMemberMetadatas == null) {
        // Special case, this may be a membership defined in the station
        // itself, not in a branch.
        //
        // This is typically reserved for stations that will open in the future.
        continue;
      }
      for (const branchMemberMetadata of branchMemberMetadatas) {
        await connection.run(
          // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
          `INSERT INTO component_branch_memberships VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            compId,
            branchMemberMetadata?.branchId ?? null,
            station.id,
            m.code,
            m.startedAt,
            m.endedAt ?? null,
            m.structureType,
            branchMemberMetadata?.sequenceOrder ?? null,
          ],
        );
      }
    }
  }
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
`);

const issues = IssueModel.getAll();
for (const issue of issues) {
  await connection.run(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    `INSERT INTO issues VALUES (?, ?, ?, ?)`,
    [
      issue.id,
      issue.title,
      JSON.stringify(issue.title_translations),
      issue.type,
    ],
  );

  const intervals = computeIssueIntervals(issue);
  for (const interval of intervals) {
    const { start, end } = interval;
    assert(start != null);
    await connection.run(
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      `INSERT INTO issue_intervals VALUES (?, ?, ?)`,
      [issue.id, start.toISO(), end?.toISO?.() ?? null],
    );
  }

  for (const compId of issue.componentIdsAffected) {
    await connection.run(
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      `INSERT INTO issue_components VALUES (?, ?)`,
      [issue.id, compId],
    );
  }

  for (const st of issue.stationIdsAffected) {
    for (const s of st.stationIds) {
      await connection.run(
        // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
        `INSERT INTO issue_stations VALUES (?, ?, ?, ?)`,
        [issue.id, st.componentId, st.branchName, s],
      );
    }
  }

  for (const u of issue.updates) {
    await connection.run(
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      `INSERT INTO issue_updates VALUES (?, ?, ?, ?, ?)`,
      [issue.id, u.type, u.text, u.sourceUrl, u.createdAt],
    );
  }
}
