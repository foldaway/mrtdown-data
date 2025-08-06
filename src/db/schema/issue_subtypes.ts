import { pgTable, text } from 'drizzle-orm/pg-core';

export const issueSubtypesTable = pgTable('issue_subtypes', {
  type: text().primaryKey(),
});
