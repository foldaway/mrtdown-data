import { writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel';
import type {
  IssuesHistory,
  IssuesHistoryPage,
} from '../../schema/IssuesHistory';

const PAGE_SIZE = 10;

export function buildIssuesHistory() {
  const issues = IssueModel.getAll();
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/issues_history.json',
  );

  const content: IssuesHistory = {
    pageCount: 0,
    fileNames: [],
  };

  issues.sort((a, b) => {
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

  for (let i = 0; i < issues.length; i += PAGE_SIZE) {
    content.pageCount++;
    const chunk = issues.slice(i, i + PAGE_SIZE);
    const chunkFileName = `issues_history_page_${content.pageCount}.json`;
    const chunkFilePath = join(
      import.meta.dirname,
      '../../../data/product/',
      chunkFileName,
    );
    content.fileNames.push(chunkFileName);
    const page: IssuesHistoryPage = {
      pageNo: content.pageCount,
      issues: chunk,
    };
    writeFileSync(chunkFilePath, JSON.stringify(page, null, 2));
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
