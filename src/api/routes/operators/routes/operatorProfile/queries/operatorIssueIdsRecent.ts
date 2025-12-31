import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function operatorIssueIdsRecentQuery(
  operatorId: string,
  limit = 15,
) {
  return await withConnection(async (connection) => {
    const sql = `
    WITH operator_lines AS (
      SELECT DISTINCT lo.line_id
      FROM line_operators lo
      WHERE lo.operator_id = $1
        AND (lo.ended_at IS NULL OR lo.ended_at > CURRENT_DATE)
    )
    SELECT
      i.id as issue_id,
      MIN(iv.start_at) AS earliest_start_at
    FROM issues i
    JOIN issue_lines il ON i.id = il.issue_id
    JOIN issue_intervals iv ON i.id = iv.issue_id
    JOIN operator_lines ol ON ol.line_id = il.line_id
    WHERE iv.start_at <= CURRENT_TIMESTAMP
    GROUP BY i.id
    ORDER BY earliest_start_at DESC
    LIMIT $2;
  `.trim();

    const result = await connection.runAndReadAll(sql, [operatorId, limit]);
    const rows = result.getRowObjectsJson();

    return rows as unknown as Row[];
  });
}
