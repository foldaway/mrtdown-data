import { connect } from '../../../../../../db/connect.js';

interface Row {
  end_at: string;
}

export async function monthLatestQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      end_at
    FROM issue_intervals
    ORDER BY end_at DESC
    LIMIT 1;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
