import { connect } from '../../../../../../db/connect.js';

interface Row {
  station_id: string;
}

export async function stationGetAllQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      s.id AS station_id
    FROM stations s
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
