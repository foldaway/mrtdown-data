import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentModel } from '../../model/ComponentModel';
import type { IssueReference, Overview } from '../../schema/Overview';
import { IssueModel } from '../../model/IssueModel';
import { DateTime, Duration } from 'luxon';
import { assert } from '../../util/assert';
import type { IssueType } from '../../schema/Issue';
import type { DateSummary } from '../../schema/DateSummary';

interface DateSummaryPartial {
  issues: IssueReference[];
  issueTypesMinutesOfDayMap: Record<IssueType, Record<number, boolean>>;
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
    const dayCount = endAt.diff(startAt).as('days');

    for (let i = 0; i < dayCount; i++) {
      const segmentStart = startAt.plus({ days: i });
      const segmentEnd = DateTime.min(endAt, segmentStart.plus({ days: 1 }));
      const dayStart = segmentStart.startOf('day');
      const segmentStartIsoDate = segmentStart.toISODate();
      assert(segmentStartIsoDate != null);

      const dateSummary = datesPartial[segmentStartIsoDate] ?? {
        issueTypesMinutesOfDayMap: {},
        issues: [],
      };
      const issueTypeMinutesOfDay =
        dateSummary.issueTypesMinutesOfDayMap[issue.type] ?? {};
      for (
        let j = segmentStart.diff(dayStart).as('minutes');
        j < segmentEnd.diff(dayStart).as('minutes');
        j++
      ) {
        issueTypeMinutesOfDay[j] = true;
      }
      dateSummary.issueTypesMinutesOfDayMap[issue.type] = issueTypeMinutesOfDay;

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

    for (const [issueType, minutesOfDayMap] of Object.entries(
      dateSummaryPartial.issueTypesMinutesOfDayMap,
    )) {
      issueTypesDurationMs[issueType as IssueType] = Duration.fromObject({
        minutes: Object.values(minutesOfDayMap).filter((val) => val === true)
          .length,
      }).as('milliseconds');
    }

    content.dates[dateIso] = {
      issues: dateSummaryPartial.issues,
      issueTypesDurationMs,
    };
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
