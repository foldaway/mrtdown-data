import { withConnection } from '../../../../db/connect.js';
import type { IssueType } from '../../../../schema/Issue.js';

const LIMIT = 10;

interface Row {
  station_id: string;
  issues_by_type: { type: IssueType; count: number }[];
  total_issues: number;
}

export async function issueCountByStation() {
  return await withConnection(async (connection) => {
    const sql = `
    WITH station_counts AS (
      SELECT
        s.id AS station_id,
        i.type,
        COUNT(DISTINCT i.id)::INTEGER AS issue_count
      FROM issues i
      JOIN issue_stations ist ON i.id = ist.issue_id
      JOIN stations s ON s.id = ist.station_id
      GROUP BY s.id, i.type
    )

    SELECT
      station_id,
      LIST(STRUCT_PACK(type := type, count := issue_count)) AS issues_by_type,
      SUM(issue_count)::INTEGER AS total_issues
    FROM station_counts
    GROUP BY station_id
    ORDER BY total_issues DESC
    LIMIT ${LIMIT};
`;

    const rows = await connection.runAndReadAll(sql);
    return rows.getRowObjectsJson() as unknown as Row[];
  });
}
