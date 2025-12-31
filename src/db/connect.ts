import 'dotenv/config';
import {
  type DuckDBConnection,
  DuckDBInstance,
  DuckDBInstanceCache,
} from '@duckdb/node-api';
import { assert } from '../util/assert.js';
import * as genericPool from 'generic-pool';

const cache = new DuckDBInstanceCache();

const { DUCKDB_DATABASE_PATH } = process.env;
assert(DUCKDB_DATABASE_PATH != null, 'DUCKDB_DATABASE_PATH must be set');

/**
 * Use a pool of connections to the DuckDB database.
 *
 * DuckDB otherwise interrupts an active statement whenever a new statement is executed
 * on the same connection (see https://github.com/duckdb/duckdb-node-neo/issues/145). Keeping
 * multiple pooled connections lets concurrent work proceed without cancelling inflight queries.
 */
const pool = genericPool.createPool({
  async create() {
    const instance = await DuckDBInstance.create(DUCKDB_DATABASE_PATH, {
      access_mode: 'READ_ONLY',
    });
    return instance.connect();
  },
  async destroy(conn: DuckDBConnection) {
    conn.closeSync();
  },
});

/**
 * Connect to the DuckDB database.
 *
 * For READ_WRITE or other non-default access modes, connections are created outside the pool.
 */
export async function connect(
  options: Record<string, string> = {
    access_mode: 'READ_ONLY',
  },
): Promise<DuckDBConnection> {
  const instance = await cache.getOrCreateInstance(
    DUCKDB_DATABASE_PATH,
    options,
  );
  return await instance.connect();
}

/**
 * Execute a function with a connection from the pool.
 * The connection is automatically acquired and released.
 */
export async function withConnection<T>(
  fn: (conn: DuckDBConnection) => Promise<T>,
): Promise<T> {
  return await pool.use(fn);
}
