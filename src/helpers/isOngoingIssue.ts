import { DateTime } from 'luxon';
import type { Issue } from '../schema/Issue';
import { assert } from '../util/assert';
import { computeIssueIntervals } from './computeIssueIntervals';

export function isOngoingIssue(issue: Issue, now = DateTime.now()): boolean {
  if (issue.endAt == null) {
    return true;
  }

  const startAt = DateTime.fromISO(issue.startAt);
  assert(startAt.isValid);
  const endAt = DateTime.fromISO(issue.endAt);
  assert(endAt.isValid);

  for (const interval of computeIssueIntervals(issue)) {
    if (interval.contains(now) || interval.isAfter(now)) {
      return true;
    }
  }

  return false;
}
