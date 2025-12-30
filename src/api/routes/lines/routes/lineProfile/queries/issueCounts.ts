import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';
import type { Granularity } from '../../../../../schema/Granularity.js';

interface IssueCountRow {
  bucket: string;
  issue_counts: { key: IssueType; value: number }[];
  total_duration_seconds: { key: IssueType; value: number }[];
}

export async function issueCountsQuery(
  lineId: string,
  granularity: Granularity,
  count: number,
) {
  const connection = await connect();
  const sql = `
    WITH bounds AS (
      SELECT
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS start_time,
        DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore') + INTERVAL 1 ${granularity} AS end_time
    ),
    buckets AS (
      SELECT *
      FROM generate_series(
        (SELECT start_time FROM bounds),
        (SELECT end_time FROM bounds),
        INTERVAL 1 ${granularity}
      ) AS g(bucket_start)
    ),
    issue_types AS (
      SELECT UNNEST(['disruption', 'maintenance', 'infra']) AS type
    ),
    bucket_issue_types AS (
      SELECT b.bucket_start AS bucket, it.type
      FROM buckets b
      CROSS JOIN issue_types it
      WHERE b.bucket_start <= DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore')
    ),
    intervals_clipped AS (
      SELECT
        i.id AS issue_id,
        i.type,
        DATE_TRUNC('${granularity}', b.bucket_start) AS bucket,
        GREATEST(iv.start_at, b.bucket_start, bo.start_time) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, bo.end_time, NOW() AT TIME ZONE 'Asia/Singapore'),
          b.bucket_start + INTERVAL 1 ${granularity}
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON i.id = il.issue_id
      CROSS JOIN bounds bo
      CROSS JOIN buckets b
      WHERE il.line_id = $1
        AND iv.start_at < b.bucket_start + INTERVAL 1 ${granularity}
        AND COALESCE(iv.end_at, bo.end_time, NOW() AT TIME ZONE 'Asia/Singapore') > b.bucket_start
    ),
    agg AS (
      SELECT
        bucket,
        type,
        COUNT(DISTINCT issue_id) AS issue_count,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS total_duration_seconds
      FROM intervals_clipped
      WHERE end_clipped > start_clipped
      GROUP BY bucket, type
    )
    SELECT
      bit.bucket,
      MAP_FROM_ENTRIES(LIST(STRUCT_PACK(key := bit.type, value := COALESCE(a.issue_count, 0)::INTEGER))) AS issue_counts,
      MAP_FROM_ENTRIES(LIST(STRUCT_PACK(key := bit.type, value := COALESCE(a.total_duration_seconds, 0)))) AS total_duration_seconds
    FROM bucket_issue_types bit
    LEFT JOIN agg a
      ON bit.bucket = a.bucket
     AND bit.type = a.type
    GROUP BY bit.bucket
    ORDER BY bit.bucket;
`.trim();
  const rows = await connection.runAndReadAll(sql, [lineId]);
  return rows.getRowObjectsJson() as unknown as IssueCountRow[];
}
