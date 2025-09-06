import { connect } from '../../../../../../db/connect.js';

interface Row {
  component_id: string;
}

export async function lineGetAllQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      c.id AS component_id,
    FROM components c
    ORDER BY
      CASE WHEN c.started_at > NOW() THEN 1 ELSE 0 END ASC,
      c.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
