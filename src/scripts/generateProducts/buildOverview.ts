import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentModel } from '../../model/ComponentModel';
import type { IssueReference, Overview } from '../../schema/Overview';
import { IssueModel } from '../../model/IssueModel';
import { DateTime, Duration, Interval } from 'luxon';
import { assert } from '../../util/assert';
import type { IssueType } from '../../schema/Issue';
import type { DateSummary } from '../../schema/DateSummary';
import { splitIntervalByServiceHours } from '../../helpers/splitIntervalByServiceHours';

interface DateSummaryPartial {
  issues: IssueReference[];
  issueTypesIntervals: Record<IssueType, Interval[]>;
}

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

  // This calculation excludes overlapping time between two issues of the same type (e.g. two overlapping disruptions)
  const datesPartial: Record<string, DateSummaryPartial> = {};

  const content: Overview = {
    components,
    dates: {},
    issuesOngoing: issues.filter((issue) => issue.endAt == null),
  };

  for (const issue of issues) {
    if (issue.endAt == null) {
      continue;
    }
    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    assert(startAt.isValid);
    const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
    assert(endAt.isValid);

    const interval = Interval.fromDateTimes(startAt, endAt);
    for (const segment of splitIntervalByServiceHours(interval)) {
      assert(segment.start != null);
      assert(segment.end != null);

      const segmentStartIsoDate = segment.start.toISODate();
      const dateSummary = datesPartial[segmentStartIsoDate] ?? {
        issues: [],
        issueTypesIntervals: {},
      };
      const intervals = dateSummary.issueTypesIntervals[issue.type] ?? [];
      intervals.push(segment);
      dateSummary.issueTypesIntervals[issue.type] = intervals;

      dateSummary.issues.push({
        id: issue.id,
        type: issue.type,
        title: issue.title,
        componentIdsAffected: issue.componentIdsAffected,
        startAt: issue.startAt,
        endAt: issue.endAt,
      });
      datesPartial[segmentStartIsoDate] = dateSummary;
    }
  }

  for (const [dateIso, dateSummaryPartial] of Object.entries(datesPartial)) {
    const issueTypesDurationMs: DateSummary['issueTypesDurationMs'] = {};

    for (const [issueType, intervals] of Object.entries(
      dateSummaryPartial.issueTypesIntervals,
    )) {
      let duration = Duration.fromObject({ milliseconds: 0 });
      for (const segment of intervals) {
        duration = duration.plus(segment.toDuration());
      }
      issueTypesDurationMs[issueType as IssueType] =
        duration.as('milliseconds');
    }

    content.dates[dateIso] = {
      issues: dateSummaryPartial.issues,
      issueTypesDurationMs,
    };
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
