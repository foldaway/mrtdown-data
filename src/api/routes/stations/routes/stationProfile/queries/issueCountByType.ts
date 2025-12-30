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
    JOIN issue_lines il ON i.id = il.issue_id
    JOIN line_branch_memberships bm ON il.line_id = bm.line_id
    WHERE bm.station_id = $1
    GROUP BY i.type
  `;

  const result = await connection.runAndReadAll(sql, [stationId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
