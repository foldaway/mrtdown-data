import { connect } from '../../../../../../db/connect.js';
import type { Granularity } from '../../../../../schema/Granularity.js';

interface UptimeRatioRow {
  bucket: string;
  uptime_ratio: number;
  total_service_seconds: number;
  total_downtime_seconds: number;
  downtime_breakdown: {
    type: 'disruption' | 'maintenance';
    downtime_seconds: number;
  }[];
}

export async function operatorUptimeRatiosQuery(
  operatorId: string,
  granularity: Granularity,
  count: number,
) {
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
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS start_time,
        DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore') + INTERVAL 1 ${granularity} AS end_time
    ),
    buckets AS (
      SELECT bucket_start
      FROM generate_series(
        (SELECT start_time FROM bounds),
        (SELECT end_time FROM bounds),
        INTERVAL 1 ${granularity}
      ) AS g(bucket_start)
      WHERE bucket_start <= DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore')
    ),
    calendar_days AS (
      SELECT
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
      JOIN operator_lines ol ON ol.line_id = l.id
      LEFT JOIN public_holidays ph ON ph.date = cd.day
      WHERE cd.day >= l.started_at
    ),
    service_windows AS (
      SELECT
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
        bucket_start,
        SUM(EXTRACT(EPOCH FROM (service_end - service_start))) AS total_service_seconds
      FROM service_windows
      GROUP BY bucket_start
    ),
    intervals_expanded AS (
      SELECT
        sw.bucket_start,
        i.type,
        GREATEST(
          iv.start_at AT TIME ZONE 'Asia/Singapore',
          sw.service_start
        ) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, b.end_time) AT TIME ZONE 'Asia/Singapore',
          sw.service_end
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON il.issue_id = i.id
      JOIN operator_lines ol ON ol.line_id = il.line_id
      JOIN service_windows sw ON sw.line_id = il.line_id
      CROSS JOIN bounds b
      WHERE i.type IN ('disruption', 'maintenance')
        AND (iv.start_at AT TIME ZONE 'Asia/Singapore') < b.end_time
        AND COALESCE(iv.end_at AT TIME ZONE 'Asia/Singapore', b.end_time) > b.start_time
        AND (iv.start_at AT TIME ZONE 'Asia/Singapore') < sw.service_end
        AND COALESCE(iv.end_at AT TIME ZONE 'Asia/Singapore', b.end_time) > sw.service_start
    ),
    downtime_totals AS (
      SELECT
        bucket_start,
        type,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS downtime_seconds
      FROM intervals_expanded
      WHERE end_clipped > start_clipped
      GROUP BY bucket_start, type
    ),
    downtime_summary AS (
      SELECT
        bucket_start,
        SUM(downtime_seconds) AS total_downtime_seconds,
        LIST(
          STRUCT_PACK(
            type := type,
            downtime_seconds := downtime_seconds
          )
        ) AS downtime_breakdown
      FROM downtime_totals
      GROUP BY bucket_start
    )
    SELECT
      b.bucket_start AS bucket,
      CASE
        WHEN COALESCE(st.total_service_seconds, 0) > 0
        THEN GREATEST(0, (st.total_service_seconds - COALESCE(ds.total_downtime_seconds, 0)) / st.total_service_seconds)
        ELSE 1.0
      END AS uptime_ratio,
      COALESCE(st.total_service_seconds, 0) AS total_service_seconds,
      COALESCE(ds.total_downtime_seconds, 0) AS total_downtime_seconds,
      COALESCE(ds.downtime_breakdown, []) AS downtime_breakdown
    FROM buckets b
    LEFT JOIN service_totals st ON b.bucket_start = st.bucket_start
    LEFT JOIN downtime_summary ds ON b.bucket_start = ds.bucket_start
    ORDER BY b.bucket_start;
  `.trim();
  const rows = await connection.runAndReadAll(sql, [operatorId]);
  return rows.getRowObjectsJson() as unknown as UptimeRatioRow[];
}
