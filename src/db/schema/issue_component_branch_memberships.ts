import { integer, primaryKey, pgTable, text } from 'drizzle-orm/pg-core';
import { issuesTable } from './issues';
import { componentBranchMembershipsTable } from './component_branch_memberships';

export const issueComponentBranchMembershipsTable = pgTable(
  'issue_component_branch_memberships',
  {
    component_branch_membership_id: integer()
      .references(() => componentBranchMembershipsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    issue_id: text()
      .references(() => issuesTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.issue_id, table.component_branch_membership_id],
    }),
  ],
);
