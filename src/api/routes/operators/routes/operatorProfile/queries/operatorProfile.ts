import { connect } from '../../../../../../db/connect.js';

interface Row {
  operator_id: string;
  line_ids: string[];
  founded_at: string | null;
}

export async function operatorProfileQuery(operatorId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      o.id AS operator_id,
      o.founded_at AS founded_at,
      COALESCE(
        (SELECT ARRAY_AGG(lo.line_id ORDER BY lo.line_id)
         FROM line_operators lo
         WHERE lo.operator_id = o.id),
        ARRAY[]
      ) AS line_ids
    FROM operators o
    WHERE o.id = $1;
  `.trim();

  const result = await connection.runAndReadAll(sql, [operatorId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
