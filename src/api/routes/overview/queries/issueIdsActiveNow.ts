import { connect } from '../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueIdsActiveNowQuery() {
  const connection = await connect();
  const sql = `
    SELECT DISTINCT
      i.id AS issue_id

    FROM issues i
    JOIN issue_intervals iv ON i.id = iv.issue_id

    WHERE iv.start_at <= NOW()
      AND (iv.end_at IS NULL OR iv.end_at > NOW())
      AND i.type IN ('disruption')

    ORDER BY i.id ASC;
    `.trim();

  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
