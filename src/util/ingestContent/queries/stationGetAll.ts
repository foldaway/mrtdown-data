import { connect } from '../../../db/connect.js';

interface Row {
  id: string;
  name: string;
  name_translations: string;
  town_id: string | null;
  geo_lat: number;
  geo_lon: number;
  line_memberships: Array<{
    line_id: string;
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
            line_id := bm.line_id,
            branch_id := bm.branch_id,
            code := bm.code,
            started_at := bm.started_at,
            ended_at := bm.ended_at,
            structure_type := bm.structure_type,
            sequence_order := bm.sequence_order
          )
        ) FILTER (WHERE bm.line_id IS NOT NULL),
        []
      ) AS line_memberships
    FROM stations s
    LEFT JOIN line_branch_memberships bm ON s.id = bm.station_id
    GROUP BY s.id, s.name, s.name_translations, s.town_id, s.geo_lat, s.geo_lon
    ORDER BY
      s.id ASC;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
