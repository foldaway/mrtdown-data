import { DateTime } from 'luxon';
import { RRuleSet } from 'rrule-rust';
import { IssueModel } from '../../model/IssueModel';
import type { IssueMaintenance } from '../../schema/Issue';
import { assert } from '../../util/assert';

export function autogenIssues() {
  const issues = IssueModel.getAll();

  for (const issue of issues) {
    if (issue.type !== 'maintenance') {
      continue;
    }

    if (issue.endAt == null || issue.autogenRrule == null) {
      continue;
    }

    const startAt = DateTime.fromISO(issue.startAt).setZone('Asia/Singapore');
    assert(startAt.isValid);
    const endAt = DateTime.fromISO(issue.endAt).setZone('Asia/Singapore');
    assert(endAt.isValid);

    const rruleSet = RRuleSet.parse(issue.autogenRrule);
    for (const dt of rruleSet.all()) {
      const dtStart = DateTime.fromObject(dt.toObject()).setZone(
        rruleSet.tzid,
        {
          keepLocalTime: true,
        },
      );
      assert(dtStart.isValid);
      const dtEnd = dtStart.plus(endAt.diff(startAt));

      const newIssue: IssueMaintenance = {
        ...issue,
        id: issue.id.replace(/^\d{4}-\d{2}-\d{2}/, dtStart.toISODate()),
        startAt: dtStart.toISO(),
        endAt: dtEnd.toISO(),
      };
      IssueModel.save(newIssue);
    }
  }
}
