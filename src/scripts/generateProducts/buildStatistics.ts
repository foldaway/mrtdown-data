import { DateTime, type Interval } from 'luxon';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateDurationWithinServiceHours } from '../../helpers/calculateDurationWithinServiceHours';
import { computeIssueIntervals } from '../../helpers/computeIssueIntervals';
import { splitIntervalByServiceHours } from '../../helpers/splitIntervalByServiceHours';
import { sumIntervalDuration } from '../../helpers/sumIntervalDuration';
import { ComponentModel } from '../../model/ComponentModel';
import { IssueModel } from '../../model/IssueModel';
import { StationModel } from '../../model/StationModel';
import type { ComponentId } from '../../schema/Component';
import type { DateSummary } from '../../schema/DateSummary';
import type { IssueType } from '../../schema/Issue';
import type { IssueReference } from '../../schema/Overview';
import type { Statistics } from '../../schema/Statistics';
import { assert } from '../../util/assert';
import { isOngoingIssue } from '../../helpers/isOngoingIssue';

interface DateSummaryPartial {
  issues: IssueReference[];
  issueTypesIntervals: Record<IssueType, Interval[]>;
  componentIdsIssueTypeIntervals: Record<
    ComponentId,
    Record<IssueType, Interval[]>
  >;
}

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

  // This calculation excludes overlapping time between two issues of the same type (e.g. two overlapping disruptions)
  const datesPartial: Record<string, DateSummaryPartial> = {};

  const dates: Statistics['dates'] = {};

  const componentsIssuesDisruptionCount: Statistics['componentsIssuesDisruptionCount'] =
    {};
  let issuesDisruptionHistoricalCount = 0;
  let issuesDisruptionDurationTotalDays = 0;

  const stationIssueCount: Record<string, number> = {};

  const componentsById: Statistics['componentsById'] = {};

  const components = ComponentModel.getAll();
  for (const component of components) {
    componentsIssuesDisruptionCount[component.id] = 0;
    componentsById[component.id] = component;
  }

  let issuesDisruptionLongest = issues
    .filter((issue) => issue.endAt != null && issue.type === 'disruption')
    .map(({ updates, ...otherProps }) => otherProps);

  issuesDisruptionLongest.sort((a, b) => {
    assert(a.endAt != null && b.endAt != null);
    const startAtA = DateTime.fromISO(a.startAt).setZone('Asia/Singapore');
    const endAtA = DateTime.fromISO(a.endAt).setZone('Asia/Singapore');
    const durationA = calculateDurationWithinServiceHours(startAtA, endAtA);

    const startAtB = DateTime.fromISO(b.startAt).setZone('Asia/Singapore');
    const endAtB = DateTime.fromISO(b.endAt).setZone('Asia/Singapore');
    const durationB = calculateDurationWithinServiceHours(startAtB, endAtB);

    if (durationA < durationB) {
      return 1;
    }
    if (durationA > durationB) {
      return -1;
    }
    return 0;
  });

  // Retain only top 10 longest disruption issues
  issuesDisruptionLongest = issuesDisruptionLongest.slice(0, 10);

  for (const issue of issues) {
    if (issue.endAt == null) {
      continue;
    }

    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    assert(startAt.isValid);
    const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
    assert(endAt.isValid);

    switch (issue.type) {
      case 'disruption': {
        issuesDisruptionHistoricalCount += 1;
        issuesDisruptionDurationTotalDays +=
          calculateDurationWithinServiceHours(startAt, endAt).as('days');

        for (const componentId of issue.componentIdsAffected) {
          componentsIssuesDisruptionCount[componentId] += 1;
        }
        break;
      }
    }

    for (const interval of computeIssueIntervals(issue)) {
      for (const segment of splitIntervalByServiceHours(interval)) {
        assert(segment.start != null);
        assert(segment.end != null);

        const segmentStartIsoDate = segment.start.toISODate();
        const dateSummary =
          datesPartial[segmentStartIsoDate] ??
          ({
            issues: [],
            issueTypesIntervals: {
              disruption: [],
              maintenance: [],
              infra: [],
            },
            componentIdsIssueTypeIntervals: {},
          } satisfies DateSummaryPartial);

        const intervals = dateSummary.issueTypesIntervals[issue.type] ?? [];
        intervals.push(segment);
        dateSummary.issueTypesIntervals[issue.type] = intervals;

        for (const componentId of issue.componentIdsAffected) {
          const componentIssueTypeIntervals =
            dateSummary.componentIdsIssueTypeIntervals[componentId] ??
            ({
              disruption: [],
              maintenance: [],
              infra: [],
            } satisfies Record<IssueType, Interval[]>);

          const intervals = componentIssueTypeIntervals[issue.type] ?? [];
          intervals.push(segment);
          componentIssueTypeIntervals[issue.type] = intervals;
          dateSummary.componentIdsIssueTypeIntervals[componentId] =
            componentIssueTypeIntervals;
        }

        dateSummary.issues.push({
          id: issue.id,
          type: issue.type,
          title: issue.title,
          title_translations: issue.title_translations,
          componentIdsAffected: issue.componentIdsAffected,
          startAt: issue.startAt,
          endAt: issue.endAt,
        });
        datesPartial[segmentStartIsoDate] = dateSummary;
      }
    }

    const stationCodes = new Set<string>();
    for (const segment of issue.stationIdsAffected) {
      for (const stationId of segment.stationIds) {
        stationCodes.add(stationId);
      }
    }

    for (const stationCode of stationCodes) {
      let count = stationIssueCount[stationCode] ?? 0;
      count++;
      stationIssueCount[stationCode] = count;
    }
  }

  for (const [dateIso, dateSummaryPartial] of Object.entries(datesPartial)) {
    const issueTypesDurationMs: DateSummary['issueTypesDurationMs'] = {};
    const issueTypesIntervalsNoOverlapMs: DateSummary['issueTypesIntervalsNoOverlapMs'] =
      {};
    const componentIdsIssueTypesDurationMs: DateSummary['componentIdsIssueTypesDurationMs'] =
      {};
    const componentIdsIssueTypesIntervalsNoOverlapMs: DateSummary['componentIdsIssueTypesIntervalsNoOverlapMs'] =
      {};

    for (const [issueType, intervals] of Object.entries(
      dateSummaryPartial.issueTypesIntervals,
    )) {
      issueTypesDurationMs[issueType as IssueType] =
        sumIntervalDuration(intervals).as('milliseconds');
      issueTypesIntervalsNoOverlapMs[issueType as IssueType] = intervals.map(
        (interval) => interval.toISO(),
      );
    }

    for (const [componentId, issueTypeIntervals] of Object.entries(
      dateSummaryPartial.componentIdsIssueTypeIntervals,
    )) {
      componentIdsIssueTypesDurationMs[componentId] = {};
      componentIdsIssueTypesIntervalsNoOverlapMs[componentId] = {};

      for (const [issueType, intervals] of Object.entries(issueTypeIntervals)) {
        componentIdsIssueTypesDurationMs[componentId][issueType as IssueType] =
          sumIntervalDuration(intervals).as('milliseconds');
        componentIdsIssueTypesIntervalsNoOverlapMs[componentId][
          issueType as IssueType
        ] = intervals.map((interval) => interval.toString());
      }
    }

    dates[dateIso] = {
      issues: dateSummaryPartial.issues,
      issueTypesDurationMs,
      issueTypesIntervalsNoOverlapMs,
      componentIdsIssueTypesIntervalsNoOverlapMs,
      componentIdsIssueTypesDurationMs,
    };
  }

  const stationIssues: Statistics['stationIssues'] = [];
  const stations = StationModel.getAll();
  for (const station of stations) {
    stationIssues.push({
      station,
      count: stationIssueCount[station.id] ?? 0,
    });
  }
  stationIssues.sort((a, b) => {
    return b.count - a.count;
  });

  const content: Statistics = {
    dates,
    issuesDisruptionHistoricalCount,
    issuesDisruptionDurationTotalDays,
    issuesDisruptionLongest,
    componentsIssuesDisruptionCount,
    stationIssues,
    componentsById,
    issuesOngoingSnapshot: issues.filter((issue) => isOngoingIssue(issue)),
  };

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
