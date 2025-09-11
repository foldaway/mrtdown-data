import { connect } from '../../../../../../../../../../db/connect.js';
import { DateTime } from 'luxon';
import { assert } from '../../../../../../../../../../util/assert.js';

interface Row {
  week: string;
  issue_ids: string[];
}

export async function issueHistoryQuery(year: string, month: string) {
  const connection = await connect();

  const startDate = DateTime.fromObject({
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: 1,
  });
  assert(startDate != null);
  const endDate = startDate.endOf('month');

  const sql = `
    WITH date_range AS (
      SELECT date_seq
      FROM range('${startDate.toISODate()}'::DATE, '${endDate.toISODate()}'::DATE + INTERVAL '1 day', INTERVAL '1 day') AS t(date_seq)
    ),
    all_weeks AS (
      SELECT DISTINCT STRFTIME(date_seq, '%Y-W%V') AS week
      FROM date_range
    ),
    issue_week_spans AS (
      SELECT
        i.id,
        dr.date_seq,
        STRFTIME(dr.date_seq, '%Y-W%V') AS week
      FROM issues i
      JOIN issue_intervals ii ON i.id = ii.issue_id
      JOIN date_range dr ON dr.date_seq BETWEEN 
        (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE 
        AND COALESCE((ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE, '${endDate.toISODate()}'::DATE)
      WHERE
        (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= '${endDate.toISODate()}'::DATE
        AND (COALESCE((ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE, '${endDate.toISODate()}'::DATE) >= '${startDate.toISODate()}'::DATE)
    ),
    issues_by_week AS (
      SELECT
        week,
        LIST(DISTINCT id ORDER BY id DESC) AS issue_ids
      FROM issue_week_spans
      GROUP BY week
    )
    SELECT
      aw.week,
      COALESCE(ibw.issue_ids, []) AS issue_ids
    FROM all_weeks aw
    LEFT JOIN issues_by_week ibw ON aw.week = ibw.week
    ORDER BY aw.week DESC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
