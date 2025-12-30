import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  line_status:
    | 'future_service'
    | 'closed_for_day'
    | 'ongoing_disruption'
    | 'ongoing_maintenance'
    | 'ongoing_infra'
    | 'normal';
  uptime_ratio: number | null;
  total_service_seconds: number | null;
  total_downtime_seconds: number | null;
  downtime_breakdown:
    | {
        type: IssueType | null;
        downtime_seconds: number;
      }[]
    | null;
  uptime_rank: number | null;
  total_lines: number | null;
  daily_issue_stats: {
    day: string | null;
    type: IssueType | 'none';
    total_duration_seconds: number;
    issue_ids: string[]; // list of issue IDs
    day_type: 'public_holiday' | 'weekend' | 'weekday';
  }[];
}

export async function lineSummaryQuery(lineId: string, days: number) {
  const connection = await connect();
  const sql = `
    WITH bounds AS (
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
        -- detect holiday/weekend/weekday
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
      LEFT JOIN public_holidays ph ON ph.date = cd.day
      WHERE l.id = $1
    ),
    service_windows AS (
      SELECT
        line_id,
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
       AND iv.start_at < b.end_time
       AND COALESCE(iv.end_at, b.end_time) > b.start_time
       AND gs.gs_local < (b.end_time AT TIME ZONE 'Asia/Singapore')
      WHERE il.line_id = $1
    ),

    -- durations of ALL issues
    durations_all AS (
      SELECT
        line_id,
        day,
        type,
        issue_id,
        day_type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS duration_seconds
      FROM intervals_expanded_all
      WHERE end_clipped > start_clipped
      GROUP BY line_id, day, type, issue_id, day_type
    ),

    -- daily breakdown for ALL issue types (including infra)
    per_day_type AS (
      SELECT
        sw.line_id,
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
        ON d.line_id = sw.line_id
       AND d.day = sw.day
      GROUP BY sw.line_id, sw.day, d.type, sw.day_type
    ),

    -- expand only disruption + maintenance for uptime calc
    intervals_expanded_downtime AS (
      SELECT *
      FROM intervals_expanded_all
      WHERE type IN ('disruption','maintenance')
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

    -- base service seconds per line (for ALL lines to calculate ranking)
    uptime_base_all AS (
      SELECT
        l.id AS line_id,
        SUM(EXTRACT(EPOCH FROM (sw_all.service_end - sw_all.service_start))) AS total_service_seconds
      FROM lines l
      JOIN (
        SELECT
          l2.id AS line_id,
          cd.day,
          (day::TEXT || ' ' || CASE
            WHEN ph.date IS NOT NULL THEN l2.weekend_start
            WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_start
            ELSE l2.weekday_start
          END::TEXT)::TIMESTAMP AS service_start,
          CASE
            WHEN (CASE
              WHEN ph.date IS NOT NULL THEN l2.weekend_end
              WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
              ELSE l2.weekday_end
            END) > (CASE
              WHEN ph.date IS NOT NULL THEN l2.weekend_start
              WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_start
              ELSE l2.weekday_start
            END)
              THEN (day::TEXT || ' ' || CASE
                WHEN ph.date IS NOT NULL THEN l2.weekend_end
                WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
                ELSE l2.weekday_end
              END::TEXT)::TIMESTAMP
              ELSE (((day + INTERVAL '1 day')::DATE)::TEXT || ' ' || CASE
                WHEN ph.date IS NOT NULL THEN l2.weekend_end
                WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
                ELSE l2.weekday_end
              END::TEXT)::TIMESTAMP
          END AS service_end
        FROM calendar_days cd
        CROSS JOIN lines l2
        CROSS JOIN bounds b
        LEFT JOIN public_holidays ph ON ph.date = cd.day
        WHERE cd.day >= l2.started_at
      ) sw_all ON sw_all.line_id = l.id
      GROUP BY l.id
    ),

    -- downtime breakdown per type for ALL lines (only disruption/maintenance)
    intervals_expanded_downtime_all AS (
      SELECT
        i.id AS issue_id,
        i.type,
        il.line_id,
        gs_local::DATE AS day,
        GREATEST(
          iv.start_at AT TIME ZONE 'Asia/Singapore',
          sw_all.service_start
        ) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, CURRENT_TIMESTAMP) AT TIME ZONE 'Asia/Singapore',
          sw_all.service_end
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON il.issue_id = i.id
      JOIN lines l ON l.id = il.line_id
      CROSS JOIN bounds b
      JOIN LATERAL (
        SELECT gs_local
        FROM generate_series(
          (iv.start_at AT TIME ZONE 'Asia/Singapore')::DATE,
          (COALESCE(iv.end_at, CURRENT_TIMESTAMP) AT TIME ZONE 'Asia/Singapore')::DATE,
          INTERVAL 1 day
        ) AS gs(gs_local)
      ) gs ON TRUE
      JOIN (
        SELECT
          l2.id AS line_id,
          cd.day,
          (day::TEXT || ' ' || CASE
            WHEN ph.date IS NOT NULL THEN l2.weekend_start
            WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_start
            ELSE l2.weekday_start
          END::TEXT)::TIMESTAMP AS service_start,
          CASE
            WHEN (CASE
              WHEN ph.date IS NOT NULL THEN l2.weekend_end
              WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
              ELSE l2.weekday_end
            END) > (CASE
              WHEN ph.date IS NOT NULL THEN l2.weekend_start
              WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_start
              ELSE l2.weekday_start
            END)
              THEN (day::TEXT || ' ' || CASE
                WHEN ph.date IS NOT NULL THEN l2.weekend_end
                WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
                ELSE l2.weekday_end
              END::TEXT)::TIMESTAMP
              ELSE (((day + INTERVAL '1 day')::DATE)::TEXT || ' ' || CASE
                WHEN ph.date IS NOT NULL THEN l2.weekend_end
                WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l2.weekend_end
                ELSE l2.weekday_end
              END::TEXT)::TIMESTAMP
          END AS service_end
        FROM calendar_days cd
        CROSS JOIN lines l2
        CROSS JOIN bounds b
        LEFT JOIN public_holidays ph ON ph.date = cd.day
        WHERE cd.day >= l2.started_at
      ) sw_all
        ON sw_all.line_id = il.line_id
       AND sw_all.day = (gs.gs_local)::DATE
       AND iv.start_at < b.end_time
       AND COALESCE(iv.end_at, b.end_time) > b.start_time
       AND gs.gs_local < (b.end_time AT TIME ZONE 'Asia/Singapore')
      WHERE i.type IN ('disruption','maintenance')
    ),
    durations_downtime_all AS (
      SELECT
        line_id,
        day,
        type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS duration_seconds
      FROM intervals_expanded_downtime_all
      WHERE end_clipped > start_clipped
      GROUP BY line_id, day, type
    ),
    uptime_breakdown_all AS (
      SELECT
        d.line_id,
        d.type,
        SUM(d.duration_seconds) AS downtime_seconds
      FROM durations_downtime_all d
      GROUP BY d.line_id, d.type
    ),

    -- final uptime summary for ALL lines
    uptime_summary_all AS (
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
      FROM uptime_base_all b
      LEFT JOIN uptime_breakdown_all ub ON b.line_id = ub.line_id
      GROUP BY b.line_id, b.total_service_seconds
    ),

    -- ranking of all lines by uptime_ratio
    uptime_rankings AS (
      SELECT
        line_id,
        uptime_ratio,
        RANK() OVER (ORDER BY uptime_ratio DESC NULLS LAST)::INTEGER AS uptime_rank,
        COUNT(*) OVER ()::INTEGER AS total_lines
      FROM uptime_summary_all
    ),

    -- base service seconds per line (for current line only)
    uptime_base AS (
      SELECT
        l.id AS line_id,
        SUM(EXTRACT(EPOCH FROM (sw.service_end - sw.service_start))) AS total_service_seconds
      FROM lines l
      JOIN service_windows sw ON sw.line_id = l.id
      WHERE sw.day >= l.started_at
        AND l.id = $1
      GROUP BY l.id
    ),

    -- downtime breakdown per type (only disruption/maintenance) for current line
    uptime_breakdown AS (
      SELECT
        d.line_id,
        d.type,
        SUM(d.duration_seconds) AS downtime_seconds
      FROM durations_downtime d
      WHERE d.line_id = $1
      GROUP BY d.line_id, d.type
    ),

    -- final uptime summary for current line
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

    -- ongoing issues for status flags
    ongoing AS (
      SELECT DISTINCT
        il.line_id,
        i.type AS issue_type
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_lines il ON il.issue_id = i.id
      WHERE iv.start_at <= NOW()
        AND (iv.end_at IS NULL OR iv.end_at > NOW())
        AND il.line_id = $1
    )

    -- final select
    SELECT
      CASE
        WHEN l.started_at > NOW() THEN 'future_service'
        WHEN EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 5
             OR (EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) = 5 AND EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 30)
          THEN 'closed_for_day'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.line_id = l.id AND o.issue_type = 'disruption')
          THEN 'ongoing_disruption'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.line_id = l.id AND o.issue_type = 'maintenance')
          THEN 'ongoing_maintenance'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.line_id = l.id AND o.issue_type = 'infra')
          THEN 'ongoing_infra'
        ELSE 'normal'
      END AS line_status,
      u.uptime_ratio,
      u.total_service_seconds,
      u.total_downtime_seconds,
      u.downtime_breakdown,
      r.uptime_rank,
      r.total_lines,
      LIST(
        STRUCT_PACK(
          day := p.day,
          type := p.type,
          total_duration_seconds := p.total_duration_seconds_day,
          issue_ids := p.issue_ids,
          day_type := p.day_type
        ) ORDER BY p.day DESC
      ) AS daily_issue_stats
    FROM lines l
    LEFT JOIN per_day_type p ON l.id = p.line_id
    LEFT JOIN uptime_summary u ON u.line_id = l.id
    LEFT JOIN uptime_rankings r ON r.line_id = l.id
    WHERE l.id = $1
    GROUP BY l.id, l.started_at, u.uptime_ratio, u.total_service_seconds, u.total_downtime_seconds, u.downtime_breakdown, r.uptime_rank, r.total_lines;
`.trim();
  const result = await connection.runAndReadAll(sql, [lineId]);
  return result.getRowObjectsJson() as unknown as Row[];
}
