import { relations } from 'drizzle-orm';
import { issueIntervalsTable } from './issue_intervals';
import { issuesTable } from './issues';

export const issuesRelations = relations(issuesTable, ({ many }) => {
  return {
    intervals: many(issueIntervalsTable),
  };
});
