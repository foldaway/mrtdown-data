import { connect } from '../../../../db/connect.js';
import type { IssueType } from '../../../../schema/Issue.js';

interface Row {
  component_id: string;
  component_status:
    | 'future_service'
    | 'closed_for_day'
    | 'ongoing_disruption'
    | 'ongoing_maintenance'
    | 'ongoing_infra'
    | 'normal';
  uptime_ratio: number;
  total_service_seconds: number;
  total_downtime_seconds: number;
  downtime_breakdown: {
    type: IssueType;
    downtime_seconds: number;
  }[];
  daily_issue_stats: {
    day: string | null;
    type: IssueType | 'none';
    total_duration_seconds: number;
    issueIds: string[];
    day_type: 'public_holiday' | 'weekend' | 'weekday';
  }[];
}

export async function lineSummariesQuery(days: number) {
  const connection = await connect();
  const sql = `
    WITH bounds AS (
      SELECT
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore' - INTERVAL '${days} days') AT TIME ZONE 'Asia/Singapore' AS start_time,
        CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Singapore' AS end_time
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
        c.id AS component_id,
        cd.day,
        -- detect holiday/weekend/weekday
        CASE
          WHEN ph.date IS NOT NULL THEN c.weekend_start
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN c.weekend_start
          ELSE c.weekday_start
        END AS start_time,
        CASE
          WHEN ph.date IS NOT NULL THEN c.weekend_end
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN c.weekend_end
          ELSE c.weekday_end
        END AS end_time,
        b.end_time,
        CASE
          WHEN ph.date IS NOT NULL THEN 'public_holiday'
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN 'weekend'
          ELSE 'weekday'
        END AS day_type
      FROM calendar_days cd
      CROSS JOIN components c
      CROSS JOIN bounds b
      LEFT JOIN public_holidays ph ON ph.date = cd.day
    ),
    service_windows AS (
      SELECT
        component_id,
        day,
        -- build timestamps in Asia/Singapore
        (day::TEXT || ' ' || start_time::TEXT)::TIMESTAMP AS service_start,
        CASE
          WHEN end_time > start_time
            THEN (day::TEXT || ' ' || end_time::TEXT)::TIMESTAMP
            ELSE (((day + INTERVAL '1 day')::DATE)::TEXT || ' ' || end_time::TEXT)::TIMESTAMP
        END AS service_end,
        day_type
      FROM service_days
    ),

    -- break each issue interval into per-calendar-day chunks
    intervals_expanded_all AS (
      SELECT
        i.id AS issue_id,
        i.type,
        i.title,
        i.title_translations,
        ic.component_id,
        c.title AS component_title,
        c.title_translations AS component_title_translations,
        c.color AS component_color,
        c.started_at AS component_started_at,
        c.weekday_start AS component_weekday_start,
        c.weekday_end AS component_weekday_end,
        c.weekend_start AS component_weekend_start,
        c.weekend_end AS component_weekend_end,
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
      JOIN issue_components ic ON ic.issue_id = i.id
      JOIN components c ON c.id = ic.component_id
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
        ON sw.component_id = ic.component_id
       AND sw.day = (gs.gs_local)::DATE
       AND iv.start_at < b.end_time
       AND COALESCE(iv.end_at, b.end_time) > b.start_time
       AND gs.gs_local < (b.end_time AT TIME ZONE 'Asia/Singapore')
    ),

    -- durations of ALL issues
    durations_all AS (
      SELECT
        component_id,
        component_title,
        component_title_translations,
        component_color,
        component_started_at,
        component_weekday_start,
        component_weekday_end,
        component_weekend_start,
        component_weekend_end,
        day,
        type,
        issue_id,
        title,
        title_translations,
        day_type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS duration_seconds
      FROM intervals_expanded_all
      WHERE end_clipped > start_clipped
      GROUP BY component_id, component_title, component_title_translations,
               component_color, component_started_at, component_weekday_start,
               component_weekday_end, component_weekend_start, component_weekend_end,
               day, type, issue_id, title, title_translations, day_type
    ),


    -- daily breakdown for ALL issue types (including infra)
    per_day_type AS (
      SELECT
        sw.component_id,
        sw.day,
        COALESCE(d.type, 'none') AS type,
        COALESCE(SUM(d.duration_seconds), 0) AS total_duration_seconds_day,
        sw.day_type,
        COALESCE(
          LIST(d.issue_id) FILTER (WHERE d.issue_id IS NOT NULL),
          []
        ) AS issue_ids
      FROM service_windows sw
      LEFT JOIN durations_all d
        ON d.component_id = sw.component_id
       AND d.day = sw.day
      GROUP BY sw.component_id, sw.day, d.type, sw.day_type
    ),

    -- expand only disruption + maintenance for uptime calc
    intervals_expanded_downtime AS (
      SELECT *
      FROM intervals_expanded_all
      WHERE type IN ('disruption','maintenance')
    ),
    durations_downtime AS (
      SELECT
        component_id,
        day,
        type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS duration_seconds
      FROM intervals_expanded_downtime
      WHERE end_clipped > start_clipped
      GROUP BY component_id, day, type
    ),

    -- base service seconds per component
    uptime_base AS (
      SELECT
        c.id AS component_id,
        SUM(EXTRACT(EPOCH FROM (sw.service_end - sw.service_start))) AS total_service_seconds
      FROM components c
      JOIN service_windows sw ON sw.component_id = c.id
      WHERE sw.day >= c.started_at
      GROUP BY c.id
    ),

    -- downtime breakdown per type (only disruption/maintenance)
    uptime_breakdown AS (
      SELECT
        d.component_id,
        d.type,
        SUM(d.duration_seconds) AS downtime_seconds
      FROM durations_downtime d
      GROUP BY d.component_id, d.type
    ),

    -- final uptime summary
    uptime_summary AS (
      SELECT
        b.component_id,
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
      LEFT JOIN uptime_breakdown ub ON b.component_id = ub.component_id
      GROUP BY b.component_id, b.total_service_seconds
    ),

    -- ongoing issues for status flags
    ongoing AS (
      SELECT DISTINCT
        ic.component_id,
        i.type AS issue_type
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_components ic ON ic.issue_id = i.id
      WHERE iv.start_at <= NOW()
        AND (iv.end_at IS NULL OR iv.end_at > NOW())
    )

    -- final select
    SELECT
      c.id AS component_id,
      CASE
        WHEN c.started_at > NOW() THEN 'future_service'
        WHEN EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 5
             OR (EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) = 5 AND EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 30)
          THEN 'closed_for_day'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'disruption')
          THEN 'ongoing_disruption'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'maintenance')
          THEN 'ongoing_maintenance'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'infra')
          THEN 'ongoing_infra'
        ELSE 'normal'
      END AS component_status,
      COALESCE(us.uptime_ratio, 1.0) AS uptime_ratio,
      COALESCE(us.total_service_seconds, 0) AS total_service_seconds,
      COALESCE(us.total_downtime_seconds, 0) AS total_downtime_seconds,
      COALESCE(us.downtime_breakdown, []) AS downtime_breakdown,
      LIST(
        STRUCT_PACK(
          day := p.day,
          type := p.type,
          total_duration_seconds := p.total_duration_seconds_day,
          issueIds := p.issue_ids,
          day_type := p.day_type
        ) ORDER BY p.day DESC
      ) AS daily_issue_stats
    FROM components c
    LEFT JOIN per_day_type p ON c.id = p.component_id
    LEFT JOIN uptime_summary us ON us.component_id = c.id
    GROUP BY c.id, c.started_at, us.uptime_ratio, us.total_service_seconds, us.total_downtime_seconds, us.downtime_breakdown
    ORDER BY
      CASE WHEN c.started_at > NOW() THEN 1 ELSE 0 END ASC,
      c.id ASC;
`.trim();
  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
