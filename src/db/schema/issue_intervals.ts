import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { issuesTable } from './issues';

export const issueIntervalsTable = pgTable('issue_intervals', {
  issue_id: text()
    .references(() => issuesTable.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    .notNull(),
  startAt: timestamp({ mode: 'string', withTimezone: true }).notNull(),
  endAt: timestamp({ mode: 'string', withTimezone: true }),
});
