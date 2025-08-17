import { DateTime } from 'luxon';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeDateSummaries } from '../../helpers/computeDateSummaries.js';
import { isOngoingIssue } from '../../helpers/isOngoingIssue.js';
import { ComponentModel } from '../../model/ComponentModel.js';
import { IssueModel } from '../../model/IssueModel.js';
import type { Overview } from '../../schema/Overview.js';

export function buildOverview() {
  const components = ComponentModel.getAll();
  const issues = IssueModel.getAll();
  issues.sort((a, b) => {
    const startAtA = DateTime.fromISO(a.startAt).setZone('Asia/Singapore');
    const startAtB = DateTime.fromISO(b.startAt).setZone('Asia/Singapore');
    const diffSeconds = startAtA.diff(startAtB).as('seconds');

    if (diffSeconds < 0) {
      return 1;
    }
    if (diffSeconds > 0) {
      return -1;
    }
    return 0;
  });

  const filePath = join(
    import.meta.dirname,
    '../../../data/product/overview.json',
  );

  const content: Overview = {
    components,
    dates: computeDateSummaries(
      issues.filter((issue) => !isOngoingIssue(issue)),
    ),
    issuesOngoingSnapshot: issues.filter((issue) => isOngoingIssue(issue)),
  };

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
