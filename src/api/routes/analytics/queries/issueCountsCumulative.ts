import { connect } from '../../../../db/connect.js';
import type { IssueType } from '../../../../schema/Issue.js';
import type { Granularity } from '../../../schema/Granularity.js';

interface Row {
  period: string;
  breakdown: {
    key: IssueType;
    value: {
      issue_count: number;
      total_duration_seconds: number;
    };
  }[];
}

export async function issueCountsCumulativeQuery(
  granularity: Granularity,
  count: number,
) {
  const connection = await connect();
  const sql = `
    WITH bounds AS (
      SELECT
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS current_start_time,
        DATE_TRUNC('${granularity}', NOW() AT TIME ZONE 'Asia/Singapore') + INTERVAL 1 ${granularity} AS current_end_time,
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count * 2 - 1} ${granularity}) AS prior_start_time,
        DATE_TRUNC('${granularity}', (NOW() AT TIME ZONE 'Asia/Singapore') - INTERVAL ${count - 1} ${granularity}) AS prior_end_time
    ),
    issue_types AS (
      SELECT DISTINCT i.type
      FROM issues i
      JOIN issue_lines il ON i.id = il.issue_id
    ),
    periods AS (
      SELECT 'current' AS period
      UNION ALL
      SELECT 'prior' AS period
    ),
    period_issue_types AS (
      SELECT p.period, it.type
      FROM periods p
      CROSS JOIN issue_types it
    ),
    current_intervals AS (
      SELECT
        i.id AS issue_id,
        i.type,
        GREATEST(iv.start_at, bo.current_start_time) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, bo.current_end_time, NOW() AT TIME ZONE 'Asia/Singapore'),
          bo.current_end_time
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON i.id = il.issue_id
      CROSS JOIN bounds bo
      WHERE iv.start_at < bo.current_end_time
        AND COALESCE(iv.end_at, bo.current_end_time, NOW() AT TIME ZONE 'Asia/Singapore') > bo.current_start_time
    ),
    prior_intervals AS (
      SELECT
        i.id AS issue_id,
        i.type,
        GREATEST(iv.start_at, bo.prior_start_time) AS start_clipped,
        LEAST(
          COALESCE(iv.end_at, bo.prior_end_time, NOW() AT TIME ZONE 'Asia/Singapore'),
          bo.prior_end_time
        ) AS end_clipped
      FROM issues i
      JOIN issue_intervals iv ON i.id = iv.issue_id
      JOIN issue_lines il ON i.id = il.issue_id
      CROSS JOIN bounds bo
      WHERE iv.start_at < bo.prior_end_time
        AND COALESCE(iv.end_at, bo.prior_end_time, NOW() AT TIME ZONE 'Asia/Singapore') > bo.prior_start_time
    ),
    current_agg AS (
      SELECT
        'current' AS period,
        type,
        COUNT(DISTINCT issue_id) AS issue_count,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS total_duration_seconds
      FROM current_intervals
      WHERE end_clipped > start_clipped
      GROUP BY type
    ),
    prior_agg AS (
      SELECT
        'prior' AS period,
        type,
        COUNT(DISTINCT issue_id) AS issue_count,
        SUM(EXTRACT(EPOCH FROM (end_clipped - start_clipped))) AS total_duration_seconds
      FROM prior_intervals
      WHERE end_clipped > start_clipped
      GROUP BY type
    )
    SELECT
      pit.period,
      MAP_FROM_ENTRIES(
        LIST(
          STRUCT_PACK(
            key := pit.type,
            value := STRUCT_PACK(
              issue_count := COALESCE(ca.issue_count, pa.issue_count, 0),
              total_duration_seconds := COALESCE(ca.total_duration_seconds, pa.total_duration_seconds, 0)
            )
          )
        )
      ) AS breakdown
    FROM period_issue_types pit
    LEFT JOIN current_agg ca ON pit.period = ca.period AND pit.type = ca.type
    LEFT JOIN prior_agg pa ON pit.period = pa.period AND pit.type = pa.type
    GROUP BY pit.period
    ORDER BY pit.period
`.trim();
  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
