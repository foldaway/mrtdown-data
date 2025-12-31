import { withConnection } from '../../../db/connect.js';

interface Row {
  issue_id: string;
  title: string;
  type: string;
  intervals: Array<{
    start_at: string;
    end_at: string | null;
  }>;
  updates: Array<{
    type: string;
    text: string;
    source_url: string;
    created_at: string;
  }>;
}

export async function issueGetQuery(issueId: string) {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT
      i.id AS issue_id,
      i.title,
      i.type,
      list(
        struct_pack(
          start_at := strftime(ii.start_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S'),
          end_at := CASE WHEN ii.end_at IS NULL THEN NULL
                         ELSE strftime(ii.end_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S')
                    END
        )
        ORDER BY ii.start_at DESC
      ) AS intervals,
      list(
        struct_pack(
          type := iu.type,
          text := iu.text,
          source_url := iu.source_url,
          created_at := strftime(iu.created_at AT TIME ZONE 'Asia/Singapore', '%Y-%m-%dT%H:%M:%S')
        )
      ) AS updates
    FROM issues i
    LEFT JOIN issue_intervals ii ON i.id = ii.issue_id
    LEFT JOIN issue_updates iu ON i.id = iu.issue_id
    WHERE i.id = ?
    GROUP BY i.id, i.title, i.type;
  `.trim();

    const result = await connection.runAndReadAll(sql, [issueId]);
    const rows = result.getRowObjectsJson() as unknown as Row[];

    // Process the updates to handle empty arrays properly
    return rows.map((row) => ({
      ...row,
      intervals:
        row.intervals?.filter((interval) => interval.start_at !== null) || [],
      updates: row.updates?.filter((update) => update.type !== null) || [],
    }));
  });
}
