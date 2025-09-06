import 'dotenv/config';
import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { assert } from '../util/assert.js';

let connection: DuckDBConnection;

/**
 * Connect to the DuckDB database.
 */
export async function connect(
  options: Record<string, string> = {
    access_mode: 'READ_ONLY',
  },
) {
  const { DUCKDB_DATABASE_PATH } = process.env;
  assert(DUCKDB_DATABASE_PATH != null, 'DUCKDB_DATABASE_PATH must be set');

  if (connection == null) {
    const instance = await DuckDBInstance.create(DUCKDB_DATABASE_PATH, options);
    connection = await instance.connect();
  }
  return connection;
}
