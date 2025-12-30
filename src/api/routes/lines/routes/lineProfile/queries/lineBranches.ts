import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
  title: string;
  title_translations: string; // JSON string
  started_at: string | null; // DATE
  ended_at: string | null; // DATE
  stationIds: string[];
}

export async function lineBranchesQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      b.id,
      b.title,
      b.title_translations,
      b.started_at,
      b.ended_at,
      LIST(bm.station_id ORDER BY bm.sequence_order) AS stationIds
    FROM branches b
    INNER JOIN line_branch_memberships bm ON bm.line_id = b.line_id AND bm.branch_id = b.id
    WHERE b.line_id = $1
    GROUP BY b.id, b.title, b.title_translations, b.started_at, b.ended_at
    ORDER BY b.started_at ASC
    `;

  const rows = await connection.runAndReadAll(sql, [lineId]);
  return rows.getRowObjectsJson() as unknown as Row[];
}
