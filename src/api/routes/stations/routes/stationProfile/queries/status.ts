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
    WITH station_components AS (
      SELECT DISTINCT 
        c.id as component_id,
        c.started_at,
        c.weekday_start,
        c.weekday_end,
        c.weekend_start,
        c.weekend_end,
        cbm.started_at as membership_started_at
      FROM component_branch_memberships cbm
      JOIN components c ON c.id = cbm.component_id
      WHERE cbm.station_id = $1
    ),
    active_components AS (
      SELECT * FROM station_components 
      WHERE (membership_started_at IS NULL OR membership_started_at <= now())
        AND (started_at IS NULL OR started_at <= now())
    ),
    ongoing_issues AS (
      SELECT DISTINCT i.type as issue_type
      FROM issues i
      JOIN issue_intervals iv ON iv.issue_id = i.id
      JOIN issue_components ic ON ic.issue_id = i.id
      JOIN station_components sc ON sc.component_id = ic.component_id
      WHERE iv.start_at <= now()
        AND (iv.end_at IS NULL OR iv.end_at > now())
    )

    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM active_components) THEN 'future_service'
        WHEN NOT EXISTS (
          SELECT 1 FROM active_components ac
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
