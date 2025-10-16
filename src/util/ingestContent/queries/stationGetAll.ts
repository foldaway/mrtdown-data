import { connect } from '../../../db/connect.js';

interface Row {
  id: string;
  name: string;
  name_translations: string;
  town_id: string | null;
  geo_lat: number;
  geo_lon: number;
  component_memberships: Array<{
    component_id: string;
    branch_id: string | null;
    code: string;
    started_at: string;
    ended_at: string | null;
    structure_type: string;
    sequence_order: number | null;
  }>;
}

export async function stationGetAllQuery() {
  const connection = await connect();

  const sql = `
    SELECT
      s.id,
      s.name,
      s.name_translations,
      s.town_id,
      s.geo_lat,
      s.geo_lon,
      COALESCE(
        LIST(
          STRUCT_PACK(
            component_id := cbm.component_id,
            branch_id := cbm.branch_id,
            code := cbm.code,
            started_at := cbm.started_at,
            ended_at := cbm.ended_at,
            structure_type := cbm.structure_type,
            sequence_order := cbm.sequence_order
          )
        ) FILTER (WHERE cbm.component_id IS NOT NULL),
        []
      ) AS component_memberships
    FROM stations s
    LEFT JOIN component_branch_memberships cbm ON s.id = cbm.station_id
    GROUP BY s.id, s.name, s.name_translations, s.town_id, s.geo_lat, s.geo_lon
    ORDER BY
      s.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
