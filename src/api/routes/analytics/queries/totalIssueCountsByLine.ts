import { connect } from '../../../../db/connect.js';

interface Row {
  component_id: string;
  component_title: string;
  component_title_translations: string; // JSON string
  component_color: string;
  issue_type: string;
  issue_count: number;
}

export async function totalIssueCountsByLineQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      c.id AS component_id,
      c.title AS component_title,
      c.title_translations AS component_title_translations,
      c.color AS component_color,
      i.type AS issue_type,
      COUNT(DISTINCT i.id)::INTEGER AS issue_count
    FROM issues i
    JOIN issue_components ic ON i.id = ic.issue_id
    JOIN components c ON ic.component_id = c.id
    GROUP BY c.id, c.title, c.title_translations, c.color, i.type
    ORDER BY c.id, issue_type;
`.trim();

  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
