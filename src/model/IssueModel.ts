import { basename, extname, join } from 'node:path';
import type { Issue, IssueId } from '../schema/Issue';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  getAllByOverlappingDateRange(dateMin: string, dateMax: string): Issue[] {
    const issues = this.getAll();

    const dateTimeMin = DateTime.fromISO(dateMin).startOf('day');
    const dateTimeMax = DateTime.fromISO(dateMax)
      .startOf('day')
      .plus({ day: 1 });

    return issues.filter((issue) => {
      const dateTimeStartAt = DateTime.fromISO(issue.startAt);

      if (issue.endAt == null) {
        // startAt within specified range
        return dateTimeStartAt <= dateTimeMax;
      }

      const dateTimeEndAt = DateTime.fromISO(issue.endAt);

      // endAt before specified range
      if (dateTimeEndAt < dateTimeMin) {
        return false;
      }
      // startAt after specified range
      if (dateTimeStartAt > dateTimeMax) {
        return false;
      }

      return true;
    });
  },

  delete(id: string) {
    const fileName = `${id}.json`;
    const filePath = join(dirPathIssue, fileName);
    rmSync(filePath);
  },

  save(issue: Issue) {
    const fileName = `${issue.id}.json`;
    const filePath = join(dirPathIssue, fileName);
    writeFileSync(filePath, JSON.stringify(issue, null, 2), {
      encoding: 'utf-8',
    });
  },
};
