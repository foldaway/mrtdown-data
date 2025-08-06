import { primaryKey, pgTable, text } from 'drizzle-orm/pg-core';
import { issuesTable } from './issues';

export const issueSubtypeMembershipsTable = pgTable(
  'issue_subtype_memberships',
  {
    subtype_type: text().notNull(),
    issue_id: text()
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.issue_id, table.subtype_type] })],
);
