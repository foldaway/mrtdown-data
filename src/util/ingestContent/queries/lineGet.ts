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
  component_id: string;
  branch_memberships: BranchMembership[];
}

export async function lineGetQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      c.id AS component_id,
      CASE
        WHEN COUNT(cbm.station_id) > 0 THEN
          LIST(
            STRUCT_PACK(
              branch_id := cbm.branch_id,
              station_id := cbm.station_id,
              code := cbm.code,
              started_at := cbm.started_at,
              ended_at := cbm.ended_at,
              structure_type := cbm.structure_type,
              sequence_order := cbm.sequence_order
            ) ORDER BY cbm.branch_id ASC, cbm.sequence_order ASC
          )
        ELSE []
      END AS branch_memberships
    FROM components c
    LEFT JOIN component_branch_memberships cbm ON c.id = cbm.component_id
    WHERE c.id = $1
    GROUP BY c.id, c.started_at
    ORDER BY
      CASE WHEN c.started_at > NOW() THEN 1 ELSE 0 END ASC,
      c.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql, [lineId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
