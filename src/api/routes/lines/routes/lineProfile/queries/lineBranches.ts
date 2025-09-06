import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
  title: string;
  title_translations: string; // JSON string
  started_at: string | null; // DATE
  ended_at: string | null; // DATE
  stationIds: string[];
}

export async function lineBranchesQuery(componentId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      b.id,
      b.title,
      b.title_translations,
      b.started_at,
      b.ended_at,
      LIST(cbm.station_id ORDER BY cbm.sequence_order) AS stationIds
    FROM branches b
    INNER JOIN component_branch_memberships cbm ON cbm.component_id = b.component_id AND cbm.branch_id = b.id
    WHERE b.component_id = $1
    GROUP BY b.id, b.title, b.title_translations, b.started_at, b.ended_at
    ORDER BY b.started_at ASC
    `;

  const rows = await connection.runAndReadAll(sql, [componentId]);
  return rows.getRowObjectsJson() as unknown as Row[];
}
