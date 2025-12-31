import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  start_at: string;
}

export async function monthEarliestQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      start_at
    FROM issue_intervals
    ORDER BY start_at ASC
    LIMIT 1;
  `.trim();

    const result = await connection.runAndReadAll(sql);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
