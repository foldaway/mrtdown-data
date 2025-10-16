import { connect } from '../../../db/connect.js';

interface Row {
  component_id: string;
  component_title: string;
  component_title_translations: string;
  component_type: string;
  component_color: string;
  component_started_at: string;
  branch_id: string;
  branch_title: string;
  branch_title_translations: string;
  branch_started_at: string | null;
  branch_ended_at: string | null;
  station_codes: string[];
  station_names: string[];
  station_ids: string[];
}

export async function lineBranchGetAllQuery(componentId: string) {
  const connection = await connect();

  const sql = `
    SELECT
      c.id AS component_id,
      c.title AS component_title,
      c.title_translations AS component_title_translations,
      c.type AS component_type,
      c.color AS component_color,
      c.started_at AS component_started_at,
      b.id AS branch_id,
      b.title AS branch_title,
      b.title_translations AS branch_title_translations,
      b.started_at AS branch_started_at,
      b.ended_at AS branch_ended_at,
      ARRAY_AGG(cbm.code ORDER BY cbm.sequence_order) AS station_codes,
      ARRAY_AGG(s.name ORDER BY cbm.sequence_order) AS station_names,
      ARRAY_AGG(s.id ORDER BY cbm.sequence_order) AS station_ids
    FROM components c
    JOIN branches b ON c.id = b.component_id
    LEFT JOIN component_branch_memberships cbm ON c.id = cbm.component_id AND b.id = cbm.branch_id
    LEFT JOIN stations s ON cbm.station_id = s.id
    WHERE c.id = ?
    GROUP BY
      c.id, c.title, c.title_translations, c.type, c.color, c.started_at,
      b.id, b.title, b.title_translations, b.started_at, b.ended_at
    ORDER BY
      b.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql, [componentId]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
