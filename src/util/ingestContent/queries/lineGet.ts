import { connect } from '../../../db/connect.js';

interface BranchMembership {
  branch_id: string;
  station_id: string;
  code: string;
  started_at: string;
  ended_at: string | null;
  structure_type: string;
  sequence_order: number | null;
}

interface Row {
  line_id: string;
  branch_memberships: BranchMembership[];
}

export async function lineGetQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      l.id AS line_id,
      CASE
        WHEN COUNT(bm.station_id) > 0 THEN
          LIST(
            STRUCT_PACK(
              branch_id := bm.branch_id,
              station_id := bm.station_id,
              code := bm.code,
              started_at := bm.started_at,
              ended_at := bm.ended_at,
              structure_type := bm.structure_type,
              sequence_order := bm.sequence_order
            ) ORDER BY bm.branch_id ASC, bm.sequence_order ASC
          )
        ELSE []
      END AS branch_memberships
    FROM lines l
    LEFT JOIN line_branch_memberships bm ON l.id = bm.line_id
    WHERE l.id = $1
    GROUP BY l.id, l.started_at
    ORDER BY
      CASE WHEN l.started_at > NOW() THEN 1 ELSE 0 END ASC,
      l.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql, [lineId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
