import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  id: string;
}

export async function stationGetQuery(stationId: string) {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      id
    FROM stations
    WHERE id = $1
  `.trim();

    const result = await connection.runAndReadAll(sql, [stationId]);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
