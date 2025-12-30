import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  uptime_ratio: number | null;
  total_service_seconds: number | null;
  total_downtime_seconds: number | null;
  downtime_breakdown:
    | {
        type: IssueType | null;
        downtime_seconds: number;
      }[]
    | null;
}

export async function operatorSummaryQuery(operatorId: string, days: number) {
  const connection = await connect();
  const sql = `
    WITH operator_lines AS (
      SELECT DISTINCT lo.line_id
      FROM line_operators lo
      WHERE lo.operator_id = $1
        AND (lo.ended_at IS NULL OR lo.ended_at > CURRENT_DATE)
    ),
    bounds AS (
      SELECT
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore' - INTERVAL '${days} days') AT TIME ZONE 'Asia/Singapore' AS start_time,
        CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore' AT TIME ZONE 'Asia/Singapore' AS end_time
    ),
    calendar_days AS (
      SELECT gs::DATE AS day
      FROM generate_series(
        DATE_TRUNC('day', (SELECT start_time FROM bounds) AT TIME ZONE 'Asia/Singapore'),
        DATE_TRUNC('day', (SELECT end_time   FROM bounds) AT TIME ZONE 'Asia/Singapore'),
        INTERVAL 1 day
      ) AS t(gs)
    ),
    service_days AS (
      SELECT
        l.id AS line_id,
        cd.day,
        CASE
          WHEN ph.date IS NOT NULL THEN l.weekend_start
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l.weekend_start
          ELSE l.weekday_start
        END AS start_time,
        CASE
          WHEN ph.date IS NOT NULL THEN l.weekend_end
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l.weekend_end
          ELSE l.weekday_end
        END AS end_time,
        b.end_time,
        CASE
          WHEN ph.date IS NOT NULL THEN 'public_holiday'
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN 'weekend'
          ELSE 'weekday'
        END AS day_type
      FROM calendar_days cd
      CROSS JOIN lines l
      CROSS JOIN bounds b
      JOIN operator_lines ol ON ol.line_id = l.id
      LEFT JOIN public_holidays ph ON ph.date = cd.day
    ),
    service_windows AS (
      SELECT
        line_id,
        day,
        (day::TEXT || ' ' || start_time::TEXT)::TIMESTAMP AS service_start,
        CASE
          WHEN end_time > start_time
            THEN (day::TEXT || ' ' || end_time::TEXT)::TIMESTAMP
            ELSE (((day + INTERVAL '1 day')::DATE)::TEXT || ' ' || end_time::TEXT)::TIMESTAMP
        END AS service_end,
        day_type
      FROM service_days
    ),
    intervals_expanded_downtime AS (
      SELECT
        i.id AS issue_id,
        i.type,
        il.line_id,
        gs_local::DATE AS day,
        GREATEST(
          iv.start_at AT TIME ZONE 'Asia/Singapore',
          sw.service_start
        ) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, CURRENT_TIMESTAMP) AT TIME ZONE 'Asia/Singapore',
          sw.service_end
        ) AS end_clipped,
        sw.day_type
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON il.issue_id = i.id
      JOIN lines l ON l.id = il.line_id
      JOIN operator_lines ol ON ol.line_id = l.id
      CROSS JOIN bounds b
      JOIN LATERAL (
        SELECT gs_local
        FROM generate_series(
          (iv.start_at AT TIME ZONE 'Asia/Singapore')::DATE,
          (COALESCE(iv.end_at, CURRENT_TIMESTAMP) AT TIME ZONE 'Asia/Singapore')::DATE,
          INTERVAL 1 day
        ) AS gs(gs_local)
      ) gs ON TRUE
      JOIN service_windows sw
        ON sw.line_id = il.line_id
       AND sw.day = (gs.gs_local)::DATE
       AND (iv.start_at AT TIME ZONE 'Asia/Singapore') < b.end_time
       AND COALESCE(iv.end_at AT TIME ZONE 'Asia/Singapore', b.end_time) > b.start_time
       AND gs.gs_local < b.end_time
      WHERE i.type IN ('disruption','maintenance')
    ),
    durations_downtime AS (
      SELECT
        line_id,
        day,
        type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS duration_seconds
      FROM intervals_expanded_downtime
      WHERE end_clipped > start_clipped
      GROUP BY line_id, day, type
    ),
    uptime_base AS (
      SELECT
        l.id AS line_id,
        SUM(EXTRACT(EPOCH FROM (sw.service_end - sw.service_start))) AS total_service_seconds
      FROM lines l
      JOIN service_windows sw ON sw.line_id = l.id
      JOIN operator_lines ol ON ol.line_id = l.id
      WHERE sw.day >= l.started_at
      GROUP BY l.id
    ),
    uptime_breakdown AS (
      SELECT
        d.line_id,
        d.type,
        SUM(d.duration_seconds) AS downtime_seconds
      FROM durations_downtime d
      GROUP BY d.line_id, d.type
    ),
    uptime_summary AS (
      SELECT
        b.line_id,
        b.total_service_seconds,
        COALESCE(SUM(ub.downtime_seconds),0) AS total_downtime_seconds,
        (b.total_service_seconds - COALESCE(SUM(ub.downtime_seconds),0)) / b.total_service_seconds AS uptime_ratio,
        LIST(
          STRUCT_PACK(
            type := ub.type,
            downtime_seconds := ub.downtime_seconds
          )
        ) AS downtime_breakdown
      FROM uptime_base b
      LEFT JOIN uptime_breakdown ub ON b.line_id = ub.line_id
      GROUP BY b.line_id, b.total_service_seconds
    ),
    downtime_by_type AS (
      SELECT
        ub.type,
        SUM(ub.downtime_seconds) AS downtime_seconds
      FROM uptime_breakdown ub
      GROUP BY ub.type
    ),
    totals AS (
      SELECT
        COALESCE(SUM(total_service_seconds), 0) AS total_service_seconds,
        COALESCE(SUM(total_downtime_seconds), 0) AS total_downtime_seconds
      FROM uptime_summary
    )
    SELECT
      COALESCE(t.total_service_seconds, 0) AS total_service_seconds,
      COALESCE(t.total_downtime_seconds, 0) AS total_downtime_seconds,
      CASE
        WHEN COALESCE(t.total_service_seconds, 0) > 0
        THEN (COALESCE(t.total_service_seconds, 0) - COALESCE(t.total_downtime_seconds, 0)) / COALESCE(t.total_service_seconds, 0)
        ELSE NULL
      END AS uptime_ratio,
      COALESCE(
        LIST(
          STRUCT_PACK(
            type := dbt.type,
            downtime_seconds := dbt.downtime_seconds
          )
        ),
        []
      ) AS downtime_breakdown
    FROM totals t
    LEFT JOIN downtime_by_type dbt ON TRUE
    GROUP BY t.total_service_seconds, t.total_downtime_seconds;
  `.trim();
  const result = await connection.runAndReadAll(sql, [operatorId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
