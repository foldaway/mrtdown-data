import { connect } from '../../../../../../db/connect.js';

interface Row {
  operator_id: string;
}

export async function operatorGetAllQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      o.id AS operator_id
    FROM operators o
    ORDER BY
      o.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
