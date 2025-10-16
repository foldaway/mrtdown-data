import { connect } from '../../../db/connect.js';

interface ComponentMembership {
  component_id: string;
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
  component_memberships: ComponentMembership[];
}

export async function stationSearchQuery(names: string[]) {
  const connection = await connect();

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
              WHEN cbm.component_id IS NOT NULL THEN
                json_object(
                  'component_id', cbm.component_id,
                  'branch_id', cbm.branch_id,
                  'code', cbm.code,
                  'started_at', cbm.started_at,
                  'ended_at', cbm.ended_at,
                  'structure_type', cbm.structure_type,
                  'sequence_order', cbm.sequence_order
                )
              ELSE NULL
            END
          ),
          x -> x IS NOT NULL
        ),
        []
      ) AS component_memberships
    FROM stations s
    LEFT JOIN component_branch_memberships cbm ON s.id = cbm.station_id
    WHERE s.name IN (${placeholders})
       OR s.id IN (${placeholders})
    GROUP BY s.id, s.name, s.name_translations, s.town_id, s.geo_lat, s.geo_lon
    ORDER BY s.name;
  `.trim();

  const result = await connection.runAndReadAll(sql, [...names]);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
