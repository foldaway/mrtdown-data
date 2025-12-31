import { withConnection } from '../../../db/connect.js';

interface LineMembership {
  line_id: string;
  branch_id: string;
  code: string;
  started_at: string;
  ended_at: string | null;
  structure_type: string;
  sequence_order: number;
}

interface Row {
  id: string;
  name: string;
  name_translations: {
    'zh-Hans': string;
    ta: string;
  };
  town_id: string;
  geo_lat: number;
  geo_lon: number;
  line_memberships: LineMembership[];
}

export async function stationSearchQuery(names: string[]) {
  return await withConnection(async (connection) => {
    const placeholders = names.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
    SELECT
      s.id,
      s.name,
      s.name_translations,
      s.town_id,
      s.geo_lat,
      s.geo_lon,
      COALESCE(
        list_filter(
          list(
            CASE
              WHEN bm.line_id IS NOT NULL THEN
                json_object(
                  'line_id', bm.line_id,
                  'branch_id', bm.branch_id,
                  'code', bm.code,
                  'started_at', bm.started_at,
                  'ended_at', bm.ended_at,
                  'structure_type', bm.structure_type,
                  'sequence_order', bm.sequence_order
                )
              ELSE NULL
            END
          ),
          x -> x IS NOT NULL
        ),
        []
      ) AS line_memberships
    FROM stations s
    LEFT JOIN line_branch_memberships bm ON s.id = bm.station_id
    WHERE s.name IN (${placeholders})
       OR s.id IN (${placeholders})
    GROUP BY s.id, s.name, s.name_translations, s.town_id, s.geo_lat, s.geo_lon
    ORDER BY s.name;
  `.trim();

    const result = await connection.runAndReadAll(sql, [...names]);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
