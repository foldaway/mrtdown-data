import { withConnection } from '../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueIdsDisruptionLongestQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      i.id AS issue_id
    FROM issues i
    JOIN issue_intervals iv ON i.id = iv.issue_id
    WHERE i.type = 'disruption'
    GROUP BY i.id
    ORDER BY SUM(EXTRACT(EPOCH FROM (COALESCE(iv.end_at, NOW()) - iv.start_at))) DESC
    LIMIT 10;
`;

    const rows = await connection.runAndReadAll(sql);
    return rows.getRowObjectsJson() as unknown as Row[];
  });
}
