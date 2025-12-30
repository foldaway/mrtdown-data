import { connect } from '../../../../db/connect.js';

interface Row {
  line_id: string;
  line_title: string;
  line_title_translations: string; // JSON string
  line_color: string;
  issue_type: string;
  issue_count: number;
}

export async function totalIssueCountsByLineQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      l.id AS line_id,
      l.title AS line_title,
      l.title_translations AS line_title_translations,
      l.color AS line_color,
      i.type AS issue_type,
      COUNT(DISTINCT i.id)::INTEGER AS issue_count
    FROM issues i
    JOIN issue_lines il ON i.id = il.issue_id
    JOIN lines l ON il.line_id = l.id
    GROUP BY l.id, l.title, l.title_translations, l.color, i.type
    ORDER BY l.id, issue_type;
`.trim();

  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
