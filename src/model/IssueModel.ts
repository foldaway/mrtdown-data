import { basename, extname, join } from 'node:path';
import type { Issue, IssueId } from '../schema/Issue';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';

const dirPathIssue = join(import.meta.dirname, '../../data/source/issue');

export const IssueModel = {
  getAllIds(): IssueId[] {
    const dirFilesIssue = readdirSync(dirPathIssue);
    const result: IssueId[] = [];

    for (const fileName of dirFilesIssue) {
      result.push(basename(fileName, extname(fileName)));
    }

    return result;
  },

  getAll(): Issue[] {
    const dirFilesIssue = readdirSync(dirPathIssue);
    const result: Issue[] = [];

    for (const fileName of dirFilesIssue) {
      const filePath = join(dirPathIssue, fileName);
      const issue = JSON.parse(
        readFileSync(filePath, { encoding: 'utf-8' }),
      ) as Issue;
      result.push(issue);
    }

    return result;
  },

  getOne(id: IssueId): Issue {
    const fileName = `${id}.json`;
    const filePath = join(dirPathIssue, fileName);
    const issue = JSON.parse(
      readFileSync(filePath, { encoding: 'utf-8' }),
    ) as Issue;
    return issue;
  },

  getAllBySingleDate(date: string): Issue[] {
    const issues = this.getAll();

    const dateTime = DateTime.fromISO(date);

    return issues.filter((issue) => {
      const dateTimeStartAt = DateTime.fromISO(issue.startAt);

      if (dateTime.hasSame(dateTimeStartAt, 'day')) {
        return true;
      }

      if (issue.endAt == null) {
        return dateTime >= dateTimeStartAt;
      }

      const dateTimeEndAt = DateTime.fromISO(issue.endAt);
      return dateTime >= dateTimeStartAt && dateTime < dateTimeEndAt;
    });
  },

  save(issue: Issue) {
    const fileName = `${issue.id}.json`;
    const filePath = join(dirPathIssue, fileName);
    writeFileSync(filePath, JSON.stringify(issue, null, 2), {
      encoding: 'utf-8',
    });
  },
};
