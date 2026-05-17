import { dirname, join } from 'node:path';
import type { Evidence, ImpactEvent, Issue } from '@mrtdown/core';
import { NdJson } from 'json-nd';
import { DateTime } from 'luxon';
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
    this.store.ensureDir(dirname(issueDir));
    try {
      this.store.createDir(issueDir);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        throw new Error(`Issue already exists: ${issue.id}`, { cause: error });
      }
      throw error;
    }

    try {
      this.store.writeText(join(issueDir, FILE_ISSUE_EVIDENCE), '');
      this.store.writeText(join(issueDir, FILE_ISSUE_IMPACT), '');
      this.store.writeJson(issuePath, issue);
    } catch (error) {
      this.store.delete(issueDir);
      throw error;
    }
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
      const rollbackErrors: unknown[] = [];
      try {
        this.restoreText(evidencePath, evidenceBefore);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      try {
        this.restoreText(impactPath, impactBefore);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          'appendEvidenceAndImpacts failed and rollback was incomplete',
        );
      }
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
    const date = DateTime.fromObject(
      {
        year: Number(year),
        month: Number(month),
        day: Number(day),
      },
      { zone: 'UTC' },
    );
    if (!date.isValid) {
      throw new Error(`Invalid issue ID: ${issueId}`);
    }

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
