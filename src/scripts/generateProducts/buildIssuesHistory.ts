import { writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel';
import type {
  IssuesHistory,
  IssuesHistoryPage,
  IssuesHistoryPageSection,
} from '../../schema/IssuesHistory';
import type { Issue } from '../../schema/Issue';
import { assert } from '../../util/assert';

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
      return -1;
    }
    if (diffSeconds > 0) {
      return 1;
    }
    return 0;
  });

  type QuarterIsoDate = string;
  type SectionIsoDate = string;
  const pagesMap: Record<QuarterIsoDate, Record<SectionIsoDate, Issue[]>> = {};

  for (const issue of issues) {
    const startAt = DateTime.fromISO(issue.startAt);
    const quarter = startAt.startOf('quarter').toISODate();
    assert(quarter != null);
    const month = startAt.startOf('month').toISODate();
    assert(month != null);
    const quarterIssues = pagesMap[quarter] ?? {};
    const sectionIssues = quarterIssues[month] ?? [];
    sectionIssues.push(issue);
    quarterIssues[month] = sectionIssues;
    pagesMap[quarter] = quarterIssues;
  }

  for (const [quarterIsoDate, sectionMap] of Object.entries(pagesMap)) {
    content.pageCount++;
    const chunkFileName = `issues_history_page_${content.pageCount}.json`;
    const chunkFilePath = join(
      import.meta.dirname,
      '../../../data/product/',
      chunkFileName,
    );
    content.fileNames.push(chunkFileName);
    const quarterEndAt = DateTime.fromISO(quarterIsoDate)
      .endOf('quarter')
      .toISODate();
    assert(quarterEndAt != null);

    const sections: IssuesHistoryPageSection[] = [];
    // Reverse to ensure reverse-chronological order
    for (const [sectionIsoDate, issues] of Object.entries(
      sectionMap,
    ).reverse()) {
      const sectionStartAt = DateTime.fromISO(sectionIsoDate)
        .startOf('month')
        .toISO();
      assert(sectionStartAt != null);
      const sectionEndAt = DateTime.fromISO(sectionIsoDate)
        .endOf('month')
        .toISO();
      assert(sectionEndAt != null);
      const section: IssuesHistoryPageSection = {
        id: sectionIsoDate,
        sectionStartAt,
        sectionEndAt,
        // Reverse to ensure reverse-chronological order
        issueRefs: issues
          .reverse()
          .map(({ updates, ...otherProps }) => otherProps),
      };
      sections.push(section);
    }

    const page: IssuesHistoryPage = {
      startAt: quarterIsoDate,
      endAt: quarterEndAt,
      sections,
    };
    writeFileSync(chunkFilePath, JSON.stringify(page, null, 2));
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
