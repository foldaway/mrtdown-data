import { withConnection } from '../../../../db/connect.js';

interface Row {
  key: string;
  value: string;
}

export async function metadataQuery() {
  return await withConnection(async (connection) => {
    const sql = `
    SELECT * FROM metadata;
  `.trim();

    const result = await connection.runAndReadAll(sql);
    const rows = result.getRowObjectsJson() as unknown as Row[];
    return rows;
  });
}
