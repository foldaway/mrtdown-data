import { IssueModel } from '../../model/IssueModel.js';
import { determineExistingIssue } from './helpers/determineExistingIssue.js';
import { ingestIssueInfra } from './helpers/ingestIssueInfra.js';
import { ingestIssueMaintenance } from './helpers/ingestIssueMaintenance.js';
import { ingestIssueDisruption } from './helpers/ingestIssueDisruption.js';
import type { IngestContent } from './types.js';
import { assert } from '../assert.js';
import { DateTime } from 'luxon';
import { issueGetQuery } from './queries/issueGet.js';

export async function ingestContent(content: IngestContent) {
  // HACK: Force `createdAt` to be Asia/Singapore timezone
  const createdAt = DateTime.fromISO(content.createdAt)
    .setZone('Asia/Singapore')
    .toISO();
  assert(createdAt != null, 'Expected valid createdAt');

  content.createdAt = createdAt;
  console.log('[ingestContent]', content);

  // Determine if the content is related to an existing issue or not
  const issueDeterminationResult = await determineExistingIssue(content);
  console.log(
    '[ingestContent.determineExistingIssue]',
    issueDeterminationResult,
  );

  switch (issueDeterminationResult.result.type) {
    case 'related-to-existing-issue': {
      const { issueId } = issueDeterminationResult.result;
      const issueGetQueryRows = await issueGetQuery(
        issueDeterminationResult.result.issueId,
      );
      assert(
        issueGetQueryRows.length === 1,
        `Expected one issue for id=${issueId}`,
      );
      const [issueRow] = issueGetQueryRows;

      switch (issueRow.type) {
        case 'disruption': {
          await ingestIssueDisruption(content, issueRow.issue_id);
          break;
        }
        case 'maintenance': {
          await ingestIssueMaintenance(content, issueRow.issue_id);
          break;
        }
        case 'infra': {
          await ingestIssueInfra(content, issueRow.issue_id);
          break;
        }
      }
      break;
    }
    case 'create-new-issue': {
      switch (issueDeterminationResult.result.issueType) {
        case 'disruption': {
          await ingestIssueDisruption(content, null);
          break;
        }
        case 'maintenance': {
          await ingestIssueMaintenance(content, null);
          break;
        }
        case 'infra': {
          await ingestIssueInfra(content, null);
          break;
        }
      }
      break;
    }
    case 'irrelevant-content': {
      console.log('[ingestContent] Nothing to do.');
      break;
    }
  }

  return null;
}
