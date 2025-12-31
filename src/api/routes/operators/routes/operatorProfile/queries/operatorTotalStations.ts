import { withConnection } from '../../../../../../db/connect.js';

interface Row {
  total_stations: number;
}

export async function operatorTotalStationsQuery(operatorId: string) {
  return await withConnection(async (connection) => {
    const sql = `
    WITH operator_lines AS (
      SELECT DISTINCT lo.line_id
      FROM line_operators lo
      WHERE lo.operator_id = $1
        AND (lo.ended_at IS NULL OR lo.ended_at > CURRENT_DATE)
    )
    SELECT COUNT(DISTINCT bm.station_id) AS total_stations
    FROM line_branch_memberships bm
    JOIN operator_lines ol ON ol.line_id = bm.line_id
    WHERE bm.started_at <= CURRENT_DATE
      AND (bm.ended_at IS NULL OR bm.ended_at > CURRENT_DATE)
  `;

    const result = await connection.runAndReadAll(sql, [operatorId]);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
