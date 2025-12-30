import { connect } from '../../../db/connect.js';

interface Row {
  line_id: string;
  line_title: string;
  line_title_translations: string;
  line_type: string;
  line_color: string;
  line_started_at: string;
  branch_id: string;
  branch_title: string;
  branch_title_translations: string;
  branch_started_at: string | null;
  branch_ended_at: string | null;
  station_codes: string[];
  station_names: string[];
  station_ids: string[];
}

export async function lineBranchGetAllQuery(lineId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      l.id AS line_id,
      l.title AS line_title,
      l.title_translations AS line_title_translations,
      l.type AS line_type,
      l.color AS line_color,
      l.started_at AS line_started_at,
      b.id AS branch_id,
      b.title AS branch_title,
      b.title_translations AS branch_title_translations,
      b.started_at AS branch_started_at,
      b.ended_at AS branch_ended_at,
      ARRAY_AGG(bm.code ORDER BY bm.sequence_order) AS station_codes,
      ARRAY_AGG(s.name ORDER BY bm.sequence_order) AS station_names,
      ARRAY_AGG(s.id ORDER BY bm.sequence_order) AS station_ids
    FROM lines l
    JOIN branches b ON l.id = b.line_id
    LEFT JOIN line_branch_memberships bm ON l.id = bm.line_id AND b.id = bm.branch_id
    LEFT JOIN stations s ON bm.station_id = s.id
    WHERE l.id = ?
    GROUP BY
      l.id, l.title, l.title_translations, l.type, l.color, l.started_at,
      b.id, b.title, b.title_translations, b.started_at, b.ended_at
    ORDER BY
      b.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql, [lineId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
