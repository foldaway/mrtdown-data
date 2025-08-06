import { relations } from 'drizzle-orm';
import { issuesTable } from './issues';
import { issueIntervalsTable } from './issue_intervals';

export const issueIntervalsRelations = relations(
  issueIntervalsTable,
  ({ one }) => {
    return {
      issue: one(issuesTable, {
        fields: [issueIntervalsTable.issue_id],
        references: [issuesTable.id],
      }),
    };
  },
);
