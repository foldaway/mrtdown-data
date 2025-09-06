import { arrayValue } from '@duckdb/node-api';
import { DateTime } from 'luxon';
import { connect } from '../../db/connect.js';
import { assert } from '../../util/assert.js';
import type { Issue } from '../schema/Issue.js';
import type { Landmark } from '../schema/Landmark.js';
import type { Line } from '../schema/Line.js';
import type { Station } from '../schema/Station.js';

// Much simpler individual entity queries
export async function fetchLinesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
    SELECT id, title, title_translations AS titleTranslations, type, color, started_at AS startedAt,
           STRUCT_PACK(
             weekdays := STRUCT_PACK("start" := weekday_start, "end" := weekday_end),
             weekends := STRUCT_PACK("start" := weekend_start, "end" := weekend_end)
           ) AS operatingHours
    FROM components
    WHERE id IN $1
  `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);
  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.titleTranslations === 'string');
    return {
      ...row,
      titleTranslations: JSON.parse(row.titleTranslations),
    } as Line;
  });
}

export async function fetchStationsByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
    SELECT
      s.id,
      s.name,
      s.name_translations AS nameTranslations,
      s.town_id AS townId,
      STRUCT_PACK(latitude := s.geo_lat, longitude := s.geo_lon) AS geo,
      COALESCE(
        (SELECT ARRAY_AGG(
          STRUCT_PACK(
            lineId := scm2.component_id,
            branchId := scm2.branch_id,
            code := scm2.code,
            startedAt := scm2.started_at,
            endedAt := scm2.ended_at,
            structureType := scm2.structure_type,
            sequenceOrder := scm2.sequence_order
          )
          ORDER BY CONCAT(scm2.sequence_order, '@', scm2.branch_id)
        )
        FROM component_branch_memberships scm2
        WHERE scm2.station_id = s.id),
        ARRAY[]
      ) AS memberships,
      COALESCE(
        (SELECT ARRAY_AGG(DISTINCT sl2.landmark_id)
        FROM station_landmarks sl2
        WHERE sl2.station_id = s.id AND sl2.landmark_id IS NOT NULL),
        ARRAY[]
      ) AS landmarkIds
    FROM stations s
    WHERE s.id IN $1
  `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);
  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.nameTranslations === 'string');
    return {
      ...row,
      nameTranslations: JSON.parse(row.nameTranslations),
    } as Station;
  });
}

export async function fetchIssuesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
      SELECT
        i.id,
        i.title,
        i.title_translations AS titleTranslations,
        i.type,
        COALESCE(
          (SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(iv2.end_at, NOW()) - iv2.start_at)))
          FROM issue_intervals iv2
          WHERE iv2.issue_id = i.id), 0
        ) AS durationSeconds,
        COALESCE(ARRAY_AGG(DISTINCT ic.component_id) FILTER (WHERE ic.component_id IS NOT NULL), ARRAY[]::TEXT[]) AS lineIds,
        COALESCE(ARRAY_AGG(DISTINCT iis.subtype) FILTER (WHERE iis.subtype IS NOT NULL), ARRAY[]::TEXT[]) AS subtypes,
        COALESCE(
          (SELECT ARRAY_AGG(
            STRUCT_PACK(
              lineId := ist_grouped.component_id,
              branchId := ist_grouped.branch_id,
              stationIds := ist_grouped.station_ids
            )
            ORDER BY ist_grouped.component_id, ist_grouped.branch_id
          )
          FROM (
            SELECT
              ist2.component_id,
              ist2.branch_id,
              ARRAY_AGG(ist2.station_id ORDER BY cbm.sequence_order) AS station_ids
            FROM issue_stations ist2
            JOIN component_branch_memberships cbm ON
              ist2.component_id = cbm.component_id AND
              ist2.branch_id = cbm.branch_id AND
              ist2.station_id = cbm.station_id
            WHERE ist2.issue_id = i.id
            GROUP BY ist2.component_id, ist2.branch_id
          ) AS ist_grouped),
          ARRAY[]
        ) AS branchesAffected,
        COALESCE(
          (SELECT ARRAY_AGG(
            STRUCT_PACK(
              startAt := iv2.start_at,
              endAt := iv2.end_at,
              status := CASE
                WHEN iv2.start_at <= NOW() AND (iv2.end_at IS NULL OR iv2.end_at > NOW()) THEN 'ongoing'
                WHEN iv2.end_at IS NOT NULL AND iv2.end_at < NOW() THEN 'ended'
                ELSE 'future'
              END
            )
            ORDER BY iv2.start_at
          )
          FROM issue_intervals iv2
          WHERE iv2.issue_id = i.id AND iv2.start_at IS NOT NULL),
          ARRAY[]
        ) AS intervals
      FROM issues i
      LEFT JOIN issue_components ic ON i.id = ic.issue_id
      LEFT JOIN issue_issue_subtypes iis ON i.id = iis.issue_id
      WHERE i.id IN $1
      GROUP BY i.id, i.title, i.title_translations, i.type
    `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);

  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.titleTranslations === 'string');
    assert(Array.isArray(row.intervals));
    return {
      ...row,
      titleTranslations: JSON.parse(row.titleTranslations),
      intervals: row.intervals.map((interval) => {
        assert(typeof interval === 'object' && interval !== null);
        assert(
          'startAt' in interval &&
            (interval.startAt == null || typeof interval.startAt === 'string'),
        );
        assert(
          'endAt' in interval &&
            (interval.endAt == null || typeof interval.endAt === 'string'),
        );
        assert('status' in interval && typeof interval.status === 'string');

        const startAt =
          interval.startAt != null
            ? DateTime.fromSQL(interval.startAt).toISO()
            : null;
        const endAt =
          interval.endAt != null
            ? DateTime.fromSQL(interval.endAt).toISO()
            : null;
        return {
          startAt,
          endAt,
          status: interval.status,
        };
      }),
    } as Issue;
  });
}

export async function fetchLandmarksByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
    SELECT id, name, name_translations AS nameTranslations,
    FROM landmarks
    WHERE id IN $1
  `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);
  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.nameTranslations === 'string');
    return {
      ...row,
      nameTranslations: JSON.parse(row.nameTranslations),
    } as Landmark;
  });
}

export async function fetchTownsByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
    SELECT id, name, name_translations AS nameTranslations,
    FROM towns
    WHERE id IN $1
  `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);
  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.nameTranslations === 'string');
    return {
      ...row,
      nameTranslations: JSON.parse(row.nameTranslations),
    } as Landmark;
  });
}
