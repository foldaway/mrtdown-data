import { connect } from '../../../../../../db/connect.js';

interface Row {
  id: string;
  updates: {
    type: string;
    text: string;
    sourceUrl: string | null;
    createdAt: string;
  }[];
}

export async function issueGetQuery(issueId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      issues.id,
      ARRAY_AGG(
        STRUCT_PACK(
          type := iu.type,
          text := iu.text,
          sourceUrl := iu.source_url,
          createdAt := iu.created_at
        ) ORDER BY iu.created_at DESC
      ) AS updates
    FROM issues
    LEFT JOIN issue_updates iu ON issues.id = iu.issue_id
    WHERE issues.id = $1
    GROUP BY issues.id;
  `.trim();

  const result = await connection.runAndReadAll(sql, [issueId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
