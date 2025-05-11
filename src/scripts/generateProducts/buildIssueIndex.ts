import { ComponentModel } from '../../model/ComponentModel';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { IssueIndex } from '../../schema/IssueIndex';
import { IssueModel } from '../../model/IssueModel';

export function buildIssueIndex() {
  const filePath = join(
    import.meta.dirname,
    '../../../data/product/issue_index.json',
  );

  const result: IssueIndex = [];
  for (const issue of IssueModel.getAll()) {
    result.push(issue.id);
  }
  writeFileSync(filePath, JSON.stringify(result, null, 2));
}
