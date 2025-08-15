import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { assert } from './src/util/assert';

const { DATABASE_URL } = process.env;
assert(DATABASE_URL != null, 'Expected DATABASE_URL env var');

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema',
  dialect: 'postgresql',
  dbCredentials: {
    url: DATABASE_URL,
  },
});
