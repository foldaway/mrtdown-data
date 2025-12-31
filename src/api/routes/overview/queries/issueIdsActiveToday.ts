import { withConnection } from '../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueIdsActiveTodayQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT DISTINCT
      i.id AS issue_id

    FROM issues i
    JOIN issue_intervals iv ON i.id = iv.issue_id

    WHERE DATE(iv.start_at) <= CURRENT_DATE
      AND (iv.end_at IS NULL OR DATE(iv.end_at) >= CURRENT_DATE)
      AND i.type IN ('maintenance', 'infra')

    ORDER BY i.id DESC;
    `.trim();

    const rows = await connection.runAndReadAll(sql);
    return rows.getRowObjectsJson() as unknown as Row[];
  });
}
