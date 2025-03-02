import { writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel';
import type { IssuesHistory } from '../../schema/IssuesHistory';

export function buildIssuesHistory() {
  const issues = IssueModel.getAll();
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/issues.json',
  );

  const content: IssuesHistory = {
    issues: [],
  };

  for (const issue of issues) {
    content.issues.push(issue);
  }

  content.issues.sort((a, b) => {
    const startAtA = DateTime.fromISO(a.startAt);
    const startAtB = DateTime.fromISO(b.startAt);
    const diffSeconds = startAtA.diff(startAtB).as('seconds');

    if (diffSeconds < 0) {
      return 1;
    }
    if (diffSeconds > 0) {
      return -1;
    }
    return 0;
  });

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
