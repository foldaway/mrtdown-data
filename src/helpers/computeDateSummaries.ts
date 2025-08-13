import { DateTime, Interval } from 'luxon';
import type { ComponentId } from '../schema/Component';
import type { DateSummary } from '../schema/DateSummary';
import type { Issue, IssueType } from '../schema/Issue';
import type { IssueReference } from '../schema/Overview';
import { sumIntervalDuration } from './sumIntervalDuration';
import { assert } from '../util/assert';
import { computeIssueIntervals } from './computeIssueIntervals';
import { splitIntervalByServiceHours } from './splitIntervalByServiceHours';

interface DateSummaryPartial {
  issues: IssueReference[];
  issueTypesIntervals: Record<IssueType, Interval[]>;
  componentIdsIssueTypeIntervals: Record<
    ComponentId,
    Record<IssueType, Interval[]>
  >;
}

export function computeDateSummaries(
  issues: Issue[],
): Record<string, DateSummary> {
  const dates: Record<string, DateSummary> = {};

  // This calculation excludes overlapping time between two issues of the same type (e.g. two overlapping disruptions)
  const datesPartial: Record<string, DateSummaryPartial> = {};

  for (const issue of issues) {
    if (issue.endAt == null) {
      continue;
    }
    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    assert(startAt.isValid);
    const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
    assert(endAt.isValid);

    const intervals = computeIssueIntervals(issue);

    for (const interval of intervals) {
      for (const _segment of splitIntervalByServiceHours(interval)) {
        let segment = _segment;
        // Workaround: treat station renovation as a 1-minute issue, assume that there is no line downtime
        if (
          issue.type === 'infra' &&
          issue.subtypes.includes('station.renovation')
        ) {
          segment = Interval.fromDateTimes(
            _segment.start!,
            _segment.start!.plus({ minutes: 1 }),
          );
        }

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
  }

  for (const [dateIso, dateSummaryPartial] of Object.entries(datesPartial)) {
    const issueTypesDurationMs: DateSummary['issueTypesDurationMs'] = {};
    const issueTypesIntervalsNoOverlapMs: DateSummary['issueTypesIntervalsNoOverlapMs'] =
      {};
    const componentIdsIssueTypesIntervalsNoOverlapMs: DateSummary['componentIdsIssueTypesIntervalsNoOverlapMs'] =
      {};
    const componentIdsIssueTypesDurationMs: DateSummary['componentIdsIssueTypesDurationMs'] =
      {};

    for (const [issueType, intervals] of Object.entries(
      dateSummaryPartial.issueTypesIntervals,
    )) {
      issueTypesDurationMs[issueType as IssueType] =
        sumIntervalDuration(intervals).as('milliseconds');

      issueTypesIntervalsNoOverlapMs[issueType as IssueType] = Interval.merge(
        intervals,
      ).map((interval) => interval.toISO());
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
        ] = Interval.merge(intervals).map((interval) => interval.toISO());
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

  return dates;
}
