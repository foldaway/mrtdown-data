import { connect } from '../../../../../../db/connect.js';

interface Row {
  start_at: string;
}

export async function monthEarliestQuery() {
  const connection = await connect();

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
}
