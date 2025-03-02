import zodToJsonSchema from 'zod-to-json-schema';
import { IssueModel } from '../../../model/IssueModel';
import {
  type Issue,
  type IssueMaintenance,
  IssueMaintenanceSchema,
  type IssueMaintenanceUpdate,
} from '../../../schema/Issue';
import type { IngestContent } from '../types';
import { openAiClient } from '../constants';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { summarizeUpdate } from './summarizeUpdate';
import { ComponentModel } from '../../../model/ComponentModel';
import { DateTime } from 'luxon';
import { buildComponentTable } from '../buildComponentTable';

const IssueMaintenanceAugmentResultSchema = IssueMaintenanceSchema.omit({
  updates: true,
});

const IssueMaintenanceAugmentJsonSchema = zodToJsonSchema(
  IssueMaintenanceAugmentResultSchema,
);

export async function ingestIssueMaintenance(
  content: IngestContent,
  existingIssueId: string | null,
) {
  let issue: IssueMaintenance;

  if (existingIssueId != null) {
    issue = IssueModel.getOne(existingIssueId) as IssueMaintenance;
  } else {
    issue = {
      id: 'please-overwrite',
      type: 'maintenance',
      componentIdsAffected: [],
      title: 'please-overwrite',
      startAt: content.createdAt,
      cancelledAt: null,
      endAt: null,
      updates: [],
    };
  }

  const updateIndex = issue.updates.findIndex(
    (upd) => upd.sourceUrl === content.url,
  );
  let text: string;
  switch (content.source) {
    case 'reddit': {
      text = await summarizeUpdate(content);
      console.log('[ingestContent.maintenance.summarizeUpdate]', text);
      break;
    }
    case 'news-website': {
      text = content.summary;
      break;
    }
    case 'twitter':
    case 'mastodon': {
      text = content.text;
      break;
    }
  }
  const update: IssueMaintenanceUpdate = {
    type: 'planned', // Currently no other value, classification not required.
    text,
    sourceUrl: content.url,
    createdAt: content.createdAt,
  };
  if (updateIndex !== -1) {
    issue.updates.splice(updateIndex, 1, update);
  } else {
    issue.updates.push(update);
  }

  issue.updates.sort((prev, next) => {
    const createdAtPrev = DateTime.fromISO(prev.createdAt);
    const createdAtNext = DateTime.fromISO(next.createdAt);

    if (createdAtNext > createdAtPrev) {
      return 1;
    }
    if (createdAtNext < createdAtPrev) {
      return -1;
    }
    return 0;
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
Your role is to help ingest the given post into an incidents system that tracks the MRT and LRT in Singapore.
This is the issue you are working on: ${JSON.stringify(issue)}.
Please modify the issue with details extracted from the post. You should:
- perform these updates if appropriate
  - "id" field if it has the value "please-overwrite", or if the date does not match "startAt". It must follow the format!
  - "title" field
  - is the maintenance planned or ad-hoc?
    - decide this from the updates. typically, statements in future tense tend to mean planned maintenance, while mentions of urgency/faults tend to indicate ad-hoc.
    - if planned, "startAt" should be the estimated start, and "endAt" should be the estimated end (exclusive).
    - if ad-hoc, "startAt" should be when the maintenance started, and "endAt" should default to end of day (exclusive)
  - "cancelledAt" field, if an update indicated that the maintenance was cancelled.
  - correct the "components" field based on the updates, see below for table.

  # Components table
  ${buildComponentTable()}
`.trim(),
    },
    {
      role: 'user',
      content: `The post: ${JSON.stringify(content)}`,
    },
  ];
  const response = await openAiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'IssueMaintenance',
        strict: true,
        schema: IssueMaintenanceAugmentJsonSchema,
      },
    },
  });

  const { message } = response.choices[0];
  messages.push(message);

  try {
    const issueMaintenance = IssueMaintenanceAugmentResultSchema.parse(
      JSON.parse(message.content ?? ''),
    );

    issue = {
      ...issueMaintenance,
      updates: issue.updates,
    };

    IssueModel.save(issue);

    if (existingIssueId != null && issue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueMaintenance] saved', issue);
  } catch (e) {
    console.error(e);
    console.log('[ingestIssueMaintenance] crash debug', messages);
  }
}
