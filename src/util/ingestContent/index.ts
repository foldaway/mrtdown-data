import { IssueModel } from '../../model/IssueModel.js';
import { determineExistingIssue } from './helpers/determineExistingIssue.js';
import { ingestIssueInfra } from './helpers/ingestIssueInfra.js';
import { ingestIssueMaintenance } from './helpers/ingestIssueMaintenance.js';
import { ingestIssueDisruption } from './helpers/ingestIssueDisruption.js';
import type { IngestContent } from './types.js';

export async function ingestContent(content: IngestContent) {
  console.log('[ingestContent]', content);

  // Determine if the content is related to an existing issue or not
  const issueDeterminationResult = await determineExistingIssue(content);
  console.log(
    '[ingestContent.determineExistingIssue]',
    issueDeterminationResult,
  );

  switch (issueDeterminationResult.result.type) {
    case 'related-to-existing-issue': {
      const issue = IssueModel.getOne(issueDeterminationResult.result.issueId);

      switch (issue.type) {
        case 'disruption': {
          await ingestIssueDisruption(content, issue.id);
          break;
        }
        case 'maintenance': {
          await ingestIssueMaintenance(content, issue.id);
          break;
        }
        case 'infra': {
          await ingestIssueInfra(content, issue.id);
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
