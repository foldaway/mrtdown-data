import { connect } from '../../../../../../db/connect.js';

interface Row {
  status:
    | 'future_service'
    | 'closed_for_day'
    | 'ongoing_disruption'
    | 'ongoing_maintenance'
    | 'ongoing_infra'
    | 'normal';
}

export async function statusQuery(stationId: string) {
  const connection = await connect();

  const sql = `
    WITH station_lines AS (
      SELECT DISTINCT 
        l.id as line_id,
        l.started_at,
        l.weekday_start,
        l.weekday_end,
        l.weekend_start,
        l.weekend_end,
        bm.started_at as membership_started_at
      FROM line_branch_memberships bm
      JOIN lines l ON l.id = bm.line_id
      WHERE bm.station_id = $1
    ),
    active_lines AS (
      SELECT * FROM station_lines 
      WHERE (membership_started_at IS NULL OR membership_started_at <= now())
        AND (started_at IS NULL OR started_at <= now())
    ),
    ongoing_issues AS (
      SELECT DISTINCT i.type as issue_type
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_lines il ON il.issue_id = i.id
      JOIN station_lines sl ON sl.line_id = il.line_id
      WHERE iv.start_at <= now()
        AND (iv.end_at IS NULL OR iv.end_at > now())
    )

    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM active_lines) THEN 'future_service'
        WHEN NOT EXISTS (
          SELECT 1 FROM active_lines ac
          WHERE CASE 
            WHEN EXTRACT(DOW FROM (now() AT TIME ZONE 'Asia/Singapore')) IN (0, 6) 
            THEN (now() AT TIME ZONE 'Asia/Singapore')::time BETWEEN ac.weekend_start AND ac.weekend_end
            ELSE (now() AT TIME ZONE 'Asia/Singapore')::time BETWEEN ac.weekday_start AND ac.weekday_end
          END
        ) THEN 'closed_for_day'
        WHEN EXISTS (SELECT 1 FROM ongoing_issues WHERE issue_type = 'disruption') THEN 'ongoing_disruption'
        WHEN EXISTS (SELECT 1 FROM ongoing_issues WHERE issue_type = 'maintenance') THEN 'ongoing_maintenance'
        WHEN EXISTS (SELECT 1 FROM ongoing_issues WHERE issue_type = 'infra') THEN 'ongoing_infra'
        ELSE 'normal'
      END AS status;
  `.trim();

  const result = await connection.runAndReadAll(sql, [stationId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
