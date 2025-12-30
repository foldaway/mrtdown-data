import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  type: IssueType;
  count: number;
}

export async function issueCountByTypeQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      i.type,
      COUNT(*) AS count
    FROM issues i
    JOIN issue_lines il ON i.id = il.issue_id
    WHERE il.line_id = $1
    GROUP BY i.type
  `;

  const result = await connection.runAndReadAll(sql, [lineId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
