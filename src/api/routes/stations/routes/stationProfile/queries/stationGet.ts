import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
}

export async function stationGetQuery(stationId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      id
    FROM stations
    WHERE id = $1
  `.trim();

  const result = await connection.runAndReadAll(sql, [stationId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
