import { DateTime } from 'luxon';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentModel } from '../model/ComponentModel';
import { IssueModel } from '../model/IssueModel';
import type { ComponentsOverview } from '../schema/ComponentsOverview';
import type { IssuesHistory } from '../schema/IssuesHistory';

function buildComponentsOverview() {
  const components = ComponentModel.getAll();
  const filePath = join(
    import.meta.dirname,
    '../../data/product/components_overview.json',
  );

  const content: ComponentsOverview = {
    entries: [],
  };

  for (const component of components) {
    content.entries.push({
      component,
      status: 'operational',
    });
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}

function buildIssuesHistory() {
  const issues = IssueModel.getAll();
  const filePath = join(import.meta.dirname, '../../data/product/issues.json');

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

buildComponentsOverview();
buildIssuesHistory();
