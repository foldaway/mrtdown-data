import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
}

export async function stationIdsInterchangesQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      s.id,
      COUNT(DISTINCT bm_all.line_id) as membership_count
    FROM stations s
    JOIN line_branch_memberships bm1 ON s.id = bm1.station_id
    JOIN line_branch_memberships bm_all ON s.id = bm_all.station_id
    WHERE bm1.line_id = ?
      AND bm1.started_at <= NOW()
      AND bm_all.started_at <= NOW()
      AND EXISTS (
        SELECT 1
        FROM line_branch_memberships bm2
        WHERE bm2.station_id = s.id
          AND bm2.line_id != ?
          AND bm2.started_at <= NOW()
      )
    GROUP BY s.id
    ORDER BY membership_count DESC, s.id;
  `.trim();

  const result = await connection.runAndReadAll(sql, [
    lineId,
    lineId,
  ]);
  const rows = result.getRowObjectsJson();

  return rows as unknown as Row[];
}
