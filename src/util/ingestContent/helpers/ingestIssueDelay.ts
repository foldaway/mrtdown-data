import { DateTime } from 'luxon';
import type { ChatCompletionMessageParam } from 'openai/resources';
import zodToJsonSchema from 'zod-to-json-schema';
import { IssueModel } from '../../../model/IssueModel';
import {
  type IssueDelay,
  IssueDelaySchema,
  type IssueDelayUpdate,
} from '../../../schema/Issue';
import { buildComponentTable } from '../buildComponentTable';
import { openAiClient } from '../constants';
import type { IngestContent } from '../types';
import { summarizeUpdate } from './summarizeUpdate';

const IssueDelayAugmentResultSchema = IssueDelaySchema.omit({
  updates: true,
});

const IssueDelayAugmentJsonSchema = zodToJsonSchema(
  IssueDelayAugmentResultSchema,
);

export async function ingestIssueDelay(
  content: IngestContent,
  existingIssueId: string | null,
) {
  let issue: IssueDelay;

  if (existingIssueId != null) {
    issue = IssueModel.getOne(existingIssueId) as IssueDelay;
  } else {
    issue = {
      id: 'please-overwrite',
      type: 'delay',
      componentIdsAffected: [],
      title: 'please-overwrite',
      startAt: content.createdAt,
      endAt: DateTime.fromISO(content.createdAt).endOf('day').toISO()!,
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
  const update: IssueDelayUpdate = {
    type: 'operator.update', // Currently no other value, classification not required.
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
  - "id" field if it has the value "please-overwrite". It must follow the format!
  - "title" field
  - "startAt" field
  - "endAt" field, overwrite this if an update states the delay is resolved
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
        name: 'IssueDelay',
        strict: true,
        schema: IssueDelayAugmentJsonSchema,
      },
    },
  });

  const { message } = response.choices[0];
  messages.push(message);

  try {
    const issueDelay = IssueDelayAugmentResultSchema.parse(
      JSON.parse(message.content ?? ''),
    );

    issue = {
      ...issueDelay,
      updates: issue.updates,
    };

    IssueModel.save(issue);

    if (existingIssueId != null && issue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueDelay] saved', issue);
  } catch (e) {
    console.error(e);
    console.log('[ingestIssueDelay] crash debug', messages);
  }
}
