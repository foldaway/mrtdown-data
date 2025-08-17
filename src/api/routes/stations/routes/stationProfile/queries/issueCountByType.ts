import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  type: IssueType;
  count: number;
}

export async function issueCountByTypeQuery(stationId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      i.type,
      COUNT(*)::INTEGER AS count
    FROM issues i
    JOIN issue_components ic ON i.id = ic.issue_id
    JOIN component_branch_memberships cbm ON ic.component_id = cbm.component_id
    WHERE cbm.station_id = $1
    GROUP BY i.type
  `;

  const result = await connection.runAndReadAll(sql, [stationId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
