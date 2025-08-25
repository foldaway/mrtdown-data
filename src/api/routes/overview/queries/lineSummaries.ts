import { connect } from '../../../../db/connect.js';
import type { IssueType } from '../../../../schema/Issue.js';

interface Row {
  component_id: string;
  component_status:
    | 'future_service'
    | 'closed_for_day'
    | 'ongoing_disruption'
    | 'ongoing_maintenance'
    | 'ongoing_infra'
    | 'normal';
  issue_ids_ongoing: string[];
}

export async function lineSummariesQuery() {
  const connection = await connect();
  const sql = `
    WITH ongoing AS (
      SELECT
        ic.component_id,
        i.type AS issue_type,
        i.id AS issue_id
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_components ic ON ic.issue_id = i.id
      WHERE iv.start_at <= NOW()
        AND (iv.end_at IS NULL OR iv.end_at > NOW())
    ),
    ongoing_issues AS (
      SELECT
        component_id,
        LIST(issue_id) AS issue_ids_ongoing
      FROM ongoing
      GROUP BY component_id
    )

    SELECT
      c.id AS component_id,
      CASE
        WHEN c.started_at > NOW() THEN 'future_service'
        WHEN EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 5
             OR (EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Singapore')) = 5 AND EXTRACT(MINUTE FROM (NOW() AT TIME ZONE 'Asia/Singapore')) < 30)
          THEN 'closed_for_day'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'disruption')
          THEN 'ongoing_disruption'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'maintenance')
          THEN 'ongoing_maintenance'
        WHEN EXISTS (SELECT 1 FROM ongoing o WHERE o.component_id = c.id AND o.issue_type = 'infra')
          THEN 'ongoing_infra'
        ELSE 'normal'
      END AS component_status,
      COALESCE(oi.issue_ids_ongoing, []) AS issue_ids_ongoing
    FROM components c
    LEFT JOIN ongoing_issues oi ON oi.component_id = c.id
    ORDER BY
      CASE WHEN c.started_at > NOW() THEN 1 ELSE 0 END ASC,
      c.id ASC;
`.trim();
  const rows = await connection.runAndReadAll(sql);
  return rows.getRowObjectsJson() as unknown as Row[];
}
