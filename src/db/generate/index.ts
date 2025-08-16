import { ComponentModel } from '../../model/ComponentModel.js';
import { StationModel } from '../../model/StationModel.js';
import { IssueModel } from '../../model/IssueModel.js';
import { connect } from '../connect.js';
import { computeIssueIntervals } from '../../helpers/computeIssueIntervals.js';
import { assert } from '../../util/assert.js';

const connection = await connect({
  access_mode: 'READ_WRITE',
});

await connection.run(`
  PRAGMA enable_object_cache;

  CREATE TABLE components (
    id TEXT PRIMARY KEY,
    title TEXT,
    title_translations JSON,
    type TEXT,
    color TEXT,
    started_at DATE
  );

  CREATE TABLE branches (
    id TEXT,
    component_id TEXT REFERENCES components(id),
    title TEXT,
    title_translations JSON,
    started_at DATE,
    ended_at DATE
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
    structure_type TEXT
  );

  CREATE TABLE issues (
    id TEXT PRIMARY KEY,
    title TEXT,
    title_translations JSON,
    type TEXT
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

const components = ComponentModel.getAll();
for (const component of components) {
  const { id, title, type, color, startedAt, branches } = component;

  await connection.run(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    `INSERT INTO components VALUES (?, ?, ?, ?, ?, ?)`,
    [
      component.id,
      component.title,
      JSON.stringify(component.title_translations),
      component.type,
      component.color,
      component.startedAt,
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

    for (const st of branch.stationCodes) {
      await connection.run(
        // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
        `INSERT INTO component_branch_memberships VALUES (?, ?, ?, ?, ?, ?)`,
        [component.id, branchId, st, null, branch.startedAt, null],
      );
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
      await connection.run(
        // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
        `INSERT INTO component_branch_memberships VALUES (?, ?, ?, ?, ?, ?)`,
        [compId, null, station.id, m.code, m.startedAt, m.structureType],
      );
    }
  }
}

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
