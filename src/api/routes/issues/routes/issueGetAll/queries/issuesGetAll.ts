import { connect } from '../../../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueGetAllQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      i.id AS issue_id
    FROM issues i
    ORDER BY
      i.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
