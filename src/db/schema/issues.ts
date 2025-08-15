import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { IssueType } from '../../schema/Issue';
import { binary } from '../types/binary';

export const issuesTable = pgTable(
  'issues',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    'title_zh-Hans': text().notNull(),
    title_ms: text().notNull(),
    title_ta: text().notNull(),
    type: text().$type<IssueType>().notNull(),
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
      sql`${table.type} IN ('disruption', 'maintenance', 'infra')`,
    ),
    index('issues_type_idx').on(table.type),
  ],
);
