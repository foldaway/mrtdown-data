import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { binary } from '../types/binary';

export const componentsTable = pgTable(
  'components',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    'title_zh-Hans': text().notNull(),
    title_ms: text().notNull(),
    title_ta: text().notNull(),
    type: text().notNull(),
    hash: binary().notNull(),
    created_at: timestamp({ mode: 'string' }).defaultNow().notNull(),
    updated_at: timestamp({ mode: 'string' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    check(
      'type_check',
      sql`${table.type} IN ('mrt.high', 'mrt.medium', 'lrt')`,
    ),
    index('components_type_idx').on(table.type),
  ],
);
