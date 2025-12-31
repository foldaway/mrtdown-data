import { withConnection } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  type: IssueType;
  count: number;
}

export async function operatorIssueCountByTypeQuery(
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
    )
    SELECT
      i.type,
      COUNT(DISTINCT i.id) AS count
    FROM issues i
    JOIN issue_lines il ON i.id = il.issue_id
    JOIN issue_intervals iv ON i.id = iv.issue_id
    JOIN operator_lines ol ON ol.line_id = il.line_id
    CROSS JOIN bounds b
    WHERE iv.start_at < b.end_time
      AND COALESCE(iv.end_at, b.end_time) > b.start_time
    GROUP BY i.type
  `;

    const result = await connection.runAndReadAll(sql, [operatorId]);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
