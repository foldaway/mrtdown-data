import { arrayValue } from '@duckdb/node-api';
import { connect } from '../../db/connect.js';
import type { Line } from '../schema/Line.js';
import type { Station } from '../schema/Station.js';
import type { Issue } from '../schema/Issue.js';
import { assert } from '../../util/assert.js';
import { DateTime } from 'luxon';

// Much simpler individual entity queries
export async function fetchLinesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []; // No IDs provided, return empty array
  }
  const connection = await connect();
  const sql = `
    SELECT id, title, title_translations AS titleTranslations, color, started_at AS startedAt,
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
      s.town,
      s.town_translations AS townTranslations,
      STRUCT_PACK(latitude := s.geo_lat, longitude := s.geo_lon) AS geo,
      COALESCE(
        ARRAY_AGG(
          STRUCT_PACK(
            lineId := scm.component_id,
            branchId := scm.branch_id,
            code := scm.code,
            startedAt := scm.started_at,
            endedAt := scm.ended_at,
            structureType := scm.structure_type,
            sequenceOrder := scm.sequence_order
          )
          ORDER BY CONCAT(scm.sequence_order, '@', scm.branch_id)
        ) FILTER (WHERE scm.component_id IS NOT NULL),
        ARRAY[]
      ) AS memberships
    FROM stations s
    LEFT JOIN component_branch_memberships scm ON s.id = scm.station_id
    WHERE s.id IN $1
    GROUP BY s.id, s.name, s.name_translations, s.town, s.town_translations, s.geo_lat, s.geo_lon
  `;
  const result = await connection.runAndReadAll(sql, [arrayValue(ids)]);
  return result.getRowObjectsJson().map((row) => {
    assert(typeof row.nameTranslations === 'string');
    assert(typeof row.townTranslations === 'string');
    return {
      ...row,
      nameTranslations: JSON.parse(row.nameTranslations),
      townTranslations: JSON.parse(row.townTranslations),
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
