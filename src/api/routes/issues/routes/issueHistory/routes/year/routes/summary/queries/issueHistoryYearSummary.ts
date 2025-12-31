import { withConnection } from '../../../../../../../../../../db/connect.js';

interface Row {
  month: string;
  disruption_count: number;
  maintenance_count: number;
  infra_count: number;
  total_count: number;
}

export async function issueHistoryYearSummaryQuery(year: string) {
  return await withConnection(async (connection) => {
    const sql = `
    WITH all_months AS (
      SELECT
        '${year}-' || LPAD(seq::VARCHAR, 2, '0') AS month
      FROM range(1, 13) AS t(seq)
    ),
    month_dates AS (
      SELECT
        month,
        (month || '-01')::DATE AS month_start,
        LAST_DAY((month || '-01')::DATE) AS month_end
      FROM all_months
    ),
    issue_month_spans AS (
      SELECT
        i.id,
        i.type,
        md.month
      FROM issues i
      JOIN issue_intervals ii ON i.id = ii.issue_id
      JOIN month_dates md ON
        (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= md.month_end
        AND COALESCE((ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE, '${year}-12-31'::DATE) >= md.month_start
      WHERE
        (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= '${year}-12-31'::DATE
        AND COALESCE((ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE, '${year}-12-31'::DATE) >= '${year}-01-01'::DATE
    ),
    issues_by_month AS (
      SELECT
        month,
        COUNT(DISTINCT CASE WHEN type = 'disruption' THEN id END)::INTEGER AS disruption_count,
        COUNT(DISTINCT CASE WHEN type = 'maintenance' THEN id END)::INTEGER AS maintenance_count,
        COUNT(DISTINCT CASE WHEN type = 'infra' THEN id END)::INTEGER AS infra_count,
        COUNT(DISTINCT id)::INTEGER AS total_count
      FROM issue_month_spans
      GROUP BY month
    )
    SELECT
      am.month,
      COALESCE(ibm.disruption_count, 0) AS disruption_count,
      COALESCE(ibm.maintenance_count, 0) AS maintenance_count,
      COALESCE(ibm.infra_count, 0) AS infra_count,
      COALESCE(ibm.total_count, 0) AS total_count
    FROM all_months am
    LEFT JOIN issues_by_month ibm ON am.month = ibm.month
    ORDER BY am.month ASC;
  `.trim();

    const result = await connection.runAndReadAll(sql);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
