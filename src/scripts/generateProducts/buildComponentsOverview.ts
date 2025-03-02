import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentModel } from '../../model/ComponentModel';
import type {
  COEntryDateOverview,
  ComponentsOverview,
  IssueReference,
} from '../../schema/ComponentsOverview';
import { IssueModel } from '../../model/IssueModel';
import { DateTime } from 'luxon';

export function buildComponentsOverview() {
  const components = ComponentModel.getAll();
  const issues = IssueModel.getAll();

  const filePath = join(
    import.meta.dirname,
    '../../../data/product/components_overview.json',
  );

  const content: ComponentsOverview = {
    entries: [],
  };

  for (const component of components) {
    const dates: Record<string, COEntryDateOverview> = {};

    for (const issue of issues) {
      if (!issue.componentIdsAffected.includes(component.id)) {
        continue;
      }
      if (issue.endAt == null) {
        continue;
      }
      const startAt = DateTime.fromISO(issue.startAt);
      const endAt = DateTime.fromISO(issue.endAt);
      const dayCount = endAt.diff(startAt).as('days');

      for (let i = 0; i < dayCount; i++) {
        const segmentStart = startAt.plus({ days: i });
        const segmentEnd = DateTime.min(endAt, segmentStart.plus({ days: 1 }));
        const durationMs = segmentEnd.diff(segmentStart).as('milliseconds');
        const segmentStartIsoDate = segmentStart.toISODate()!;
        const dateIssueRefs = dates[segmentStartIsoDate] ?? {
          issueTypesDurationMs: {},
          issues: [],
        };
        let issueTypeDuration =
          dateIssueRefs.issueTypesDurationMs[issue.type] ?? 0;
        issueTypeDuration += durationMs;
        dateIssueRefs.issueTypesDurationMs[issue.type] = issueTypeDuration;
        dateIssueRefs.issues.push({
          id: issue.id,
          title: issue.title,
        });
        dates[segmentStartIsoDate] = dateIssueRefs;
      }
    }

    content.entries.push({
      component,
      dates,
    });
  }

  writeFileSync(filePath, JSON.stringify(content, null, 2));
}
