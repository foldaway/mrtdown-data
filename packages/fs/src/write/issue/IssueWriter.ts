import { join } from 'node:path';
import type { Evidence, ImpactEvent, Issue } from '@mrtdown/core';
import { NdJson } from 'json-nd';
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
    const issuePath = join(issueDir, FILE_ISSUE);
    if (this.readOptionalText(issuePath) != null) {
      throw new Error(`Issue already exists: ${issue.id}`);
    }

    this.store.ensureDir(issueDir);
    this.store.writeJson(issuePath, issue);
    this.store.writeText(join(issueDir, FILE_ISSUE_EVIDENCE), '');
    this.store.writeText(join(issueDir, FILE_ISSUE_IMPACT), '');
  }

  appendEvidence(issueId: string, evidence: Evidence): void {
    const issueDir = this.getIssueDir(issueId);
    this.assertIssueExists(issueDir, issueId);
    this.store.appendText(
      join(issueDir, FILE_ISSUE_EVIDENCE),
      `${NdJson.stringify([evidence])}\n`,
    );
  }

  appendImpact(issueId: string, impact: ImpactEvent): void {
    const issueDir = this.getIssueDir(issueId);
    this.assertIssueExists(issueDir, issueId);
    this.store.appendText(
      join(issueDir, FILE_ISSUE_IMPACT),
      `${NdJson.stringify([impact])}\n`,
    );
  }

  appendEvidenceAndImpacts(
    issueId: string,
    evidence: Evidence,
    impacts: readonly ImpactEvent[],
  ): void {
    const issueDir = this.getIssueDir(issueId);
    this.assertIssueExists(issueDir, issueId);
    const evidencePath = join(issueDir, FILE_ISSUE_EVIDENCE);
    const impactPath = join(issueDir, FILE_ISSUE_IMPACT);
    const evidenceBefore = this.readOptionalText(evidencePath);
    const impactBefore = this.readOptionalText(impactPath);

    try {
      this.store.appendText(evidencePath, `${NdJson.stringify([evidence])}\n`);
      for (const impact of impacts) {
        this.store.appendText(impactPath, `${NdJson.stringify([impact])}\n`);
      }
    } catch (error) {
      this.restoreText(evidencePath, evidenceBefore);
      this.restoreText(impactPath, impactBefore);
      throw error;
    }
  }

  delete(issueId: string): void {
    this.store.delete(this.getIssueDir(issueId));
  }

  private getIssueDir(issueId: string): string {
    const tsMatch = /^(\d{4})-(\d{2})-(\d{2})(?:-(.+))?$/.exec(issueId);
    if (!tsMatch) {
      throw new Error(`Invalid issue ID: ${issueId}`);
    }

    const [, year, month, day, slug] = tsMatch;
    if (
      slug != null &&
      (!/^[A-Za-z0-9._-]+$/.test(slug) ||
        slug.includes('..') ||
        /[\\/]/.test(slug))
    ) {
      throw new Error(`Invalid issue ID: ${issueId}`);
    }

    const safeIssueId =
      slug == null
        ? `${year}-${month}-${day}`
        : `${year}-${month}-${day}-${slug}`;
    return join(DIR_ISSUE, year, month, safeIssueId);
  }

  private assertIssueExists(issueDir: string, issueId: string): void {
    if (this.readOptionalText(join(issueDir, FILE_ISSUE)) == null) {
      throw new Error(`Issue does not exist: ${issueId}`);
    }
  }

  private readOptionalText(path: string): string | null {
    try {
      return this.store.readText(path);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  }

  private restoreText(path: string, text: string | null): void {
    if (text == null) {
      this.store.delete(path);
      return;
    }
    this.store.writeText(path, text);
  }
}
