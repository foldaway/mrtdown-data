import { connect } from '../../../../../../db/connect.js';
import type { Granularity } from '../../../../../schema/Granularity.js';

interface UptimeRatioRow {
  period: string;
  uptime_ratio: number;
  total_service_seconds: number;
  total_downtime_seconds: number;
  downtime_breakdown: {
    type: 'disruption' | 'maintenance';
    downtime_seconds: number;
  }[];
}

export async function uptimeRatiosCumulativeQuery(
  lineId: string,
  granularity: Granularity,
  count: number,
) {
  const connection = await connect();
  const sql = `
    WITH periods AS (
      SELECT
        'current' AS period_name,
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS start_time,
        DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore') + INTERVAL 1 ${granularity} AS end_time
      UNION ALL
      SELECT
        'previous' AS period_name,
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count * 2 - 1} ${granularity}) AS start_time,
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS end_time
    ),

    buckets AS (
      SELECT
        p.period_name,
        bucket_start
      FROM periods p
      CROSS JOIN generate_series(
        p.start_time,
        p.end_time,
        INTERVAL 1 ${granularity}
      ) AS g(bucket_start)
      WHERE bucket_start < p.end_time
    ),

    calendar_days AS (
      SELECT
        b.period_name,
        b.bucket_start,
        gs::DATE AS day
      FROM buckets b
      CROSS JOIN generate_series(
        DATE_TRUNC('day', b.bucket_start),
        DATE_TRUNC('day', b.bucket_start + INTERVAL 1 ${granularity} - INTERVAL 1 second),
        INTERVAL 1 day
      ) AS t(gs)
    ),

    service_days AS (
      SELECT
        cd.period_name,
        cd.bucket_start,
        cd.day,
        l.id AS line_id,
        CASE
          WHEN ph.date IS NOT NULL THEN l.weekend_start
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l.weekend_start
          ELSE l.weekday_start
        END AS start_time,
        CASE
          WHEN ph.date IS NOT NULL THEN l.weekend_end
          WHEN EXTRACT(DOW FROM cd.day) IN (0,6) THEN l.weekend_end
          ELSE l.weekday_end
        END AS end_time
      FROM calendar_days cd
      CROSS JOIN lines l
      LEFT JOIN public_holidays ph ON ph.date = cd.day
      WHERE l.id = $1 AND cd.day >= l.started_at
    ),

    service_windows AS (
      SELECT
        period_name,
        bucket_start,
        line_id,
        day,
        (day + start_time)::TIMESTAMPTZ AT TIME ZONE 'Asia/Singapore' AS service_start,
        CASE
          WHEN end_time > start_time
            THEN (day + end_time)::TIMESTAMPTZ AT TIME ZONE 'Asia/Singapore'
            ELSE (day + end_time + INTERVAL '1 day')::TIMESTAMPTZ AT TIME ZONE 'Asia/Singapore'
        END AS service_end
      FROM service_days
    ),

    service_totals AS (
      SELECT
        period_name,
        SUM(EXTRACT(EPOCH FROM (service_end - service_start))) AS total_service_seconds
      FROM service_windows
      GROUP BY period_name
    ),

    intervals_expanded AS (
      SELECT
        sw.period_name,
        i.type,
        GREATEST(
          iv.start_at AT TIME ZONE 'Asia/Singapore',
          sw.service_start
        ) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, p.end_time) AT TIME ZONE 'Asia/Singapore',
          sw.service_end
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines ic ON ic.issue_id = i.id
      JOIN service_windows sw ON sw.line_id = ic.line_id
      JOIN periods p ON p.period_name = sw.period_name
      WHERE ic.line_id = $1
        AND i.type IN ('disruption', 'maintenance')
        AND iv.start_at < p.end_time
        AND COALESCE(iv.end_at, p.end_time) > p.start_time
        AND iv.start_at < sw.service_end
        AND COALESCE(iv.end_at, p.end_time) > sw.service_start
    ),

    downtime_totals AS (
      SELECT
        period_name,
        type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS downtime_seconds
      FROM intervals_expanded
      WHERE end_clipped > start_clipped
      GROUP BY period_name, type
    ),

    all_periods AS (
      SELECT 'current' AS period_name
      UNION ALL
      SELECT 'previous' AS period_name
    ),

    downtime_summary AS (
      SELECT
        ap.period_name,
        COALESCE(SUM(dt.downtime_seconds), 0) AS total_downtime_seconds,
        COALESCE(
          LIST(
            STRUCT_PACK(
              type := dt.type,
              downtime_seconds := dt.downtime_seconds
            )
          ),
          []
        ) AS downtime_breakdown
      FROM all_periods ap
      LEFT JOIN downtime_totals dt ON ap.period_name = dt.period_name
      GROUP BY ap.period_name
    )

    SELECT
      CASE
        WHEN ap.period_name = 'current' THEN 'current'
        ELSE 'previous'
      END AS period,
      CASE
        WHEN COALESCE(st.total_service_seconds, 0) > 0
        THEN GREATEST(0, (COALESCE(st.total_service_seconds, 0) - COALESCE(ds.total_downtime_seconds, 0)) / COALESCE(st.total_service_seconds, 0))
        ELSE 1.0
      END AS uptime_ratio,
      COALESCE(st.total_service_seconds, 0) AS total_service_seconds,
      COALESCE(ds.total_downtime_seconds, 0) AS total_downtime_seconds,
      COALESCE(ds.downtime_breakdown, []) AS downtime_breakdown
    FROM all_periods ap
    LEFT JOIN service_totals st ON ap.period_name = st.period_name
    LEFT JOIN downtime_summary ds ON ap.period_name = ds.period_name
    ORDER BY CASE WHEN ap.period_name = 'current' THEN 0 ELSE 1 END;
`.trim();
  const rows = await connection.runAndReadAll(sql, [lineId]);
  return rows.getRowObjectsJson() as unknown as UptimeRatioRow[];
}
