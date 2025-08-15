import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { componentsTable } from './components';

export const componentBranchesTable = pgTable(
  'component_branches',
  {
    id: text().primaryKey(),
    code: text().notNull(),
    component_id: text()
      .references(() => componentsTable.id, {
        onUpdate: 'cascade',
        onDelete: 'cascade',
      })
      .notNull(),
    title: text(),
    'title_zh-Hans': text().notNull(),
    title_ms: text().notNull(),
    title_ta: text().notNull(),
    started_at: timestamp({ mode: 'string', withTimezone: true }),
    ended_at: timestamp({ mode: 'string', withTimezone: true }),
  },
  (table) => [
    unique('component_branches_unique_idx').on(table.component_id, table.code),
    index('component_branches_code_idx').on(table.code),
    index('component_branches_component_id_idx').on(table.component_id),
  ],
);
