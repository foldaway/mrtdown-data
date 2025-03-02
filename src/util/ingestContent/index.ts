import { IssueModel } from '../../model/IssueModel';
import { classifyContent } from './helpers/classifyContent';
import { determineExistingIssue } from './helpers/determineExistingIssue';
import { ingestIssueDelay } from './helpers/ingestIssueDelay';
import { ingestIssueInfra } from './helpers/ingestIssueInfra';
import { ingestIssueMaintenance } from './helpers/ingestIssueMaintenance';
import { ingestIssueOutage } from './helpers/ingestIssueOutage';
import type { IngestContent } from './types';

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
        case 'outage': {
          await ingestIssueOutage(content, issue.id);
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
        case 'delay': {
          await ingestIssueDelay(content, issue.id);
          break;
        }
      }
      break;
    }
    case 'no-existing-issue': {
      const classification = await classifyContent(content);
      console.log('[ingestContent.classifyContent]', classification);
      switch (classification.type) {
        case 'discussion':
        case 'news':
        case 'irrelevant': {
          console.log('[ingestContent] Nothing to do.');
          return;
        }
      }

      switch (classification.type) {
        case 'service-outage': {
          await ingestIssueOutage(content, null);
          break;
        }
        case 'planned-maintenance': {
          await ingestIssueMaintenance(content, null);
          break;
        }
        case 'infrastructure': {
          await ingestIssueInfra(content, null);
          break;
        }
        case 'delay': {
          await ingestIssueDelay(content, null);
          break;
        }
      }
      break;
    }
  }

  return null;
}
