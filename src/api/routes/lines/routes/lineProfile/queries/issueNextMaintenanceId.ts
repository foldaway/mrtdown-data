import { connect } from '../../../../../../db/connect.js';

interface Row {
  issue_id: string;
}

export async function issueNextMaintenanceIdQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT i.id as issue_id
    FROM issues i
    JOIN issue_lines il ON i.id = il.issue_id
    JOIN issue_intervals iv ON i.id = iv.issue_id
    WHERE i.type = 'maintenance'
      AND il.line_id = ?
      AND iv.start_at > NOW()
    ORDER BY iv.start_at ASC
    LIMIT 1;
  `.trim();

  const result = await connection.runAndReadAll(sql, [lineId]);
  const rows = result.getRowObjectsJson();
  return rows as unknown as Row[];
}
