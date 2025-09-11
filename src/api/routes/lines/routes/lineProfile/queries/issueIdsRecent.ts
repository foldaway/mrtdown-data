import { connect } from '../../../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueIdsRecentQuery(componentId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      i.id as issue_id,
      MIN(iv.start_at) AS earliest_start_at
    FROM issues i
    JOIN issue_components ic ON i.id = ic.issue_id
    JOIN issue_intervals iv ON i.id = iv.issue_id
    WHERE ic.component_id = ?
      AND iv.start_at <= NOW()
    GROUP BY i.id
    ORDER BY earliest_start_at DESC
    LIMIT 5;
  `.trim();

  const result = await connection.runAndReadAll(sql, [componentId]);
  const rows = result.getRowObjectsJson();

  return rows as unknown as Row[];
}
