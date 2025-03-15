import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IssueModel } from '../../model/IssueModel';
import { DateTime } from 'luxon';
import { assert } from '../../util/assert';
import type { Statistics } from '../../schema/Statistics';

export function buildStatistics() {
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
    '../../../data/product/statistics.json',
  );

  const content: Statistics = {
    issuesOngoing: issues.filter((issue) => issue.endAt == null),
    dates: {},
  };

  for (const issue of issues) {
    if (issue.endAt == null) {
      continue;
    }
    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
    const dayCount = endAt.diff(startAt).as('days');

    for (let i = 0; i < dayCount; i++) {
      const segmentStart = startAt.plus({ days: i });
      const segmentEnd = DateTime.min(endAt, segmentStart.plus({ days: 1 }));
      const durationMs = segmentEnd.diff(segmentStart).as('milliseconds');
      const segmentStartIsoDate = segmentStart.toISODate();
      assert(segmentStartIsoDate != null);
      const dateSummary = content.dates[segmentStartIsoDate] ?? {
        issueTypesDurationMs: {},
        issues: [],
      };
      let issueTypeDuration = dateSummary.issueTypesDurationMs[issue.type] ?? 0;
      issueTypeDuration += durationMs;
      dateSummary.issueTypesDurationMs[issue.type] = issueTypeDuration;
      dateSummary.issues.push({
        id: issue.id,
        type: issue.type,
        title: issue.title,
        componentIdsAffected: issue.componentIdsAffected,
        startAt: issue.startAt,
        endAt: issue.endAt,
      });
      content.dates[segmentStartIsoDate] = dateSummary;
    }
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
