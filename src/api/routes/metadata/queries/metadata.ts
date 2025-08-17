import { connect } from '../../../../db/connect.js';

interface Row {
  key: string;
  value: string;
}

export async function metadataQuery() {
  const connection = await connect();

  const sql = `
    SELECT * FROM metadata;
  `.trim();

  const result = await connection.runAndReadAll(sql);
  const rows = result.getRowObjectsJson() as unknown as Row[];
  return rows;
}
