import { join } from 'node:path';
import { NdJson } from 'json-nd';
import type { Evidence } from '#schema/issue/evidence.js';
import type { ImpactEvent } from '#schema/issue/impactEvent.js';
import type { Issue } from '#schema/issue/issue.js';
import {
  DIR_ISSUE,
  FILE_ISSUE,
  FILE_ISSUE_EVIDENCE,
  FILE_ISSUE_IMPACT,
} from '../../constants.js';
import type { IWriteStore } from '../common/store.js';

export class IssueWriter {
  private readonly store: IWriteStore;

  constructor(store: IWriteStore) {
    this.store = store;
  }

  create(issue: Issue): void {
    const issueDir = this.getIssueDir(issue.id);
    this.store.ensureDir(issueDir);
    this.store.writeJson(join(issueDir, FILE_ISSUE), issue);
    this.store.writeText(join(issueDir, FILE_ISSUE_EVIDENCE), '');
    this.store.writeText(join(issueDir, FILE_ISSUE_IMPACT), '');
  }

  appendEvidence(issueId: string, evidence: Evidence): void {
    this.store.ensureDir(this.getIssueDir(issueId));
    this.store.appendText(
      join(this.getIssueDir(issueId), FILE_ISSUE_EVIDENCE),
      `${NdJson.stringify([evidence])}\n`,
    );
  }

  appendImpact(issueId: string, impact: ImpactEvent): void {
    this.store.ensureDir(this.getIssueDir(issueId));
    this.store.appendText(
      join(this.getIssueDir(issueId), FILE_ISSUE_IMPACT),
      `${NdJson.stringify([impact])}\n`,
    );
  }

  private getIssueDir(issueId: string): string {
    const tsMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(issueId);
    if (!tsMatch) {
      throw new Error(`Invalid issue ID: ${issueId}`);
    }
    const [_, year, month] = tsMatch;
    return join(DIR_ISSUE, year, month, issueId);
  }
}
