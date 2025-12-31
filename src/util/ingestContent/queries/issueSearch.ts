import { withConnection } from '../../../db/connect.js';

interface Row {
  issue_id: string;
  title: string;
  type: string;
  start_at: string;
  end_at: string | null;
  updates: Array<{
    type: string;
    text: string;
    source_url: string;
    created_at: string;
  }>;
}

export async function issueSearchQuery(dateMin: string, dateMax: string) {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      i.id AS issue_id,
      i.title,
      i.type,
      strftime(ii.start_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S') AS start_at,
      CASE WHEN ii.end_at IS NULL THEN NULL
           ELSE strftime(ii.end_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S')
      END AS end_at,
      list(
        struct_pack(
          type := iu.type,
          text := iu.text,
          source_url := iu.source_url,
          created_at := strftime(iu.created_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S')
        )
      ) AS updates
    FROM issues i
    JOIN issue_intervals ii ON i.id = ii.issue_id
    LEFT JOIN issue_updates iu ON i.id = iu.issue_id
    WHERE (
      ((ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE >= ?::DATE AND (ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= ?::DATE) OR
      (ii.end_at IS NOT NULL AND (ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE >= ?::DATE AND (ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE <= ?::DATE) OR
      ((ii.start_at AT TIME ZONE 'Asia/Singapore')::DATE <= ?::DATE AND (ii.end_at IS NULL OR (ii.end_at AT TIME ZONE 'Asia/Singapore')::DATE >= ?::DATE))
    )
    GROUP BY i.id, i.title, i.type, ii.start_at, ii.end_at
    ORDER BY ii.start_at DESC, i.id ASC;
  `.trim();

    const result = await connection.runAndReadAll(sql, [
      dateMin,
      dateMax, // start_at range check
      dateMin,
      dateMax, // end_at range check
      dateMin,
      dateMax, // overlapping range check
    ]);
    const rows = result.getRowObjectsJson() as unknown as Row[];

    // Process the updates to handle empty arrays properly
    return rows.map((row) => ({
      ...row,
      updates: row.updates?.filter((update) => update.type !== null) || [],
    }));
  });
}
