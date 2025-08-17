import { DateTime, Interval } from 'luxon';
import type { Issue } from '../schema/Issue.js';
import { RRuleSet } from 'rrule-rust';
import { assert } from '../util/assert.js';

export function computeIssueIntervals(issue: Issue): Interval[] {
  if (issue.endAt == null) {
    return [];
  }

  const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
  assert(startAt.isValid);
  const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
  assert(endAt.isValid);

  const issueIntervals: Interval[] = [];

  if ('rrule' in issue && issue.rrule != null) {
    const rruleSet = RRuleSet.parse(issue.rrule);
    for (const dt of rruleSet.all()) {
      const dtStart = DateTime.fromObject(dt.toObject()).setZone(
        rruleSet.tzid,
        {
          keepLocalTime: true,
        },
      );
      assert(dtStart.isValid);
      const dtEnd = dtStart.plus(endAt.diff(startAt));
      issueIntervals.push(Interval.fromDateTimes(dtStart, dtEnd));
    }
  } else {
    issueIntervals.push(Interval.fromDateTimes(startAt, endAt));
  }

  return issueIntervals;
}
