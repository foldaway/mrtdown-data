import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  line_id: string;
}

export async function lineGetAllQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      l.id AS line_id
    FROM lines l
    ORDER BY
      CASE WHEN l.started_at > NOW() THEN 1 ELSE 0 END ASC,
      l.id ASC;
  `.trim();

    const result = await connection.runAndReadAll(sql);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
