import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
}

export async function stationIdsInterchangesQuery(componentId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      s.id,
      COUNT(DISTINCT cbm_all.component_id) as membership_count
    FROM stations s
    JOIN component_branch_memberships cbm1 ON s.id = cbm1.station_id
    JOIN component_branch_memberships cbm_all ON s.id = cbm_all.station_id
    WHERE cbm1.component_id = ?
      AND cbm1.started_at <= NOW()
      AND cbm_all.started_at <= NOW()
      AND EXISTS (
        SELECT 1
        FROM component_branch_memberships cbm2
        WHERE cbm2.station_id = s.id
          AND cbm2.component_id != ?
          AND cbm2.started_at <= NOW()
      )
    GROUP BY s.id
    ORDER BY membership_count DESC, s.id;
  `.trim();

  const result = await connection.runAndReadAll(sql, [
    componentId,
    componentId,
  ]);
  const rows = result.getRowObjectsJson();

  return rows as unknown as Row[];
}
