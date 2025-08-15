import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { issuesTable } from './issues';

export const issueUpdatesTable = pgTable(
  'issue_updates',
  {
    issue_id: text()
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    text: text().notNull(),
    source_url: text().notNull(),
    created_at: timestamp({ mode: 'string', withTimezone: true }).notNull(),
    type: text().notNull(),
  },
  (table) => [
    unique('issue_updates_unique_idx').on(table.issue_id, table.source_url),
  ],
);
