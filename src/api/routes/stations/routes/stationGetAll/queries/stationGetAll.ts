import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  station_id: string;
}

export async function stationGetAllQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      s.id AS station_id
    FROM stations s
  `.trim();

    const result = await connection.runAndReadAll(sql);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
