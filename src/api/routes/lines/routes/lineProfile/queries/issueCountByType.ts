import { connect } from '../../../../../../db/connect.js';
import type { IssueType } from '../../../../../../schema/Issue.js';

interface Row {
  type: IssueType;
  count: number;
}

export async function issueCountByTypeQuery(componentId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      i.type,
      COUNT(*) AS count
    FROM issues i
    JOIN issue_components ic ON i.id = ic.issue_id
    WHERE ic.component_id = $1
    GROUP BY i.type
  `;

  const result = await connection.runAndReadAll(sql, [componentId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
