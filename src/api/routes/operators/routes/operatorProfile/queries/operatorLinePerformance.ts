import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  line_id: string;
  status:
    | 'future_service'
    | 'closed_for_day'
    | 'ongoing_disruption'
    | 'ongoing_maintenance'
    | 'ongoing_infra'
    | 'normal';
  uptime_ratio: number | null;
  issue_count: number;
}

export async function operatorLinePerformanceQuery(
  operatorId: string,
  days: number,
) {
  return await withConnection(async (connection) => {
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
        DATE_TRUNC('day', (SELECT start_time FROM bounds)),
        DATE_TRUNC('day', (SELECT end_time   FROM bounds)),
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
        (b.total_service_seconds - COALESCE(SUM(ub.downtime_seconds),0)) / b.total_service_seconds AS uptime_ratio
      FROM uptime_base b
      LEFT JOIN uptime_breakdown ub ON b.line_id = ub.line_id
      GROUP BY b.line_id, b.total_service_seconds
    ),
    issue_counts AS (
      SELECT
        il.line_id,
        COUNT(DISTINCT i.id) AS issue_count
      FROM issues i
      JOIN issue_lines il ON i.id = il.issue_id
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN operator_lines ol ON ol.line_id = il.line_id
      CROSS JOIN bounds b
      WHERE iv.start_at < b.end_time
        AND COALESCE(iv.end_at, b.end_time) > b.start_time
      GROUP BY il.line_id
    ),
    ongoing AS (
      SELECT DISTINCT
        il.line_id,
        i.type AS issue_type
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_lines il ON il.issue_id = i.id
      JOIN operator_lines ol ON ol.line_id = il.line_id
      WHERE iv.start_at <= CURRENT_TIMESTAMP
        AND (iv.end_at IS NULL OR iv.end_at > CURRENT_TIMESTAMP)
    )
    SELECT
      l.id AS line_id,
      CASE
        WHEN l.started_at > CURRENT_DATE THEN 'future_service'
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
      END AS status,
      us.uptime_ratio,
      COALESCE(ic.issue_count, 0) AS issue_count
    FROM lines l
    JOIN operator_lines ol ON ol.line_id = l.id
    LEFT JOIN uptime_summary us ON us.line_id = l.id
    LEFT JOIN issue_counts ic ON ic.line_id = l.id
    ORDER BY l.id;
  `.trim();
    const result = await connection.runAndReadAll(sql, [operatorId]);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
