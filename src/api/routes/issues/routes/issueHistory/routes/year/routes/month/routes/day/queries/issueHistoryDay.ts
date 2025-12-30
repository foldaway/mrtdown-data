import { connect } from '../../../../../../../../../../../../db/connect.js';
import { DateTime } from 'luxon';
import { assert } from '../../../../../../../../../../../../util/assert.js';

interface Row {
  issue_id: string;
}

export async function issueHistoryDayQuery(
  year: string,
  month: string,
  day: string,
) {
  const connection = await connect();

  const date = DateTime.fromObject({
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
  });
  assert(date != null);
  const endDate = date.plus({ days: 1 });

  const sql = `
    SELECT DISTINCT i.id AS issue_id
    FROM issues i
    JOIN issue_intervals ii ON i.id = ii.issue_id
    WHERE
      (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= '${date.toISODate()}'::DATE
      AND (COALESCE((ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE, '${date.toISODate()}'::DATE) >= '${date.toISODate()}'::DATE)
    ORDER BY i.id DESC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows.map((row) => row.issue_id);
}
