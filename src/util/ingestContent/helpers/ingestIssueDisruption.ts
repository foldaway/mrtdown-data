import type { ChatCompletionMessageParam } from 'openai/resources';
import zodToJsonSchema from 'zod-to-json-schema';
import { IssueModel } from '../../../model/IssueModel';
import {
  type IssueDisruption,
  IssueDisruptionSchema,
  type IssueDisruptionUpdate,
  IssueDisruptionUpdateTypeSchema,
} from '../../../schema/Issue';
import { openAiClient } from '../constants';
import type { IngestContent } from '../types';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { ComponentModel } from '../../../model/ComponentModel';
import { summarizeUpdate } from './summarizeUpdate';
import { buildComponentTable } from '../buildComponentTable';

const IssueDisruptionAugmentResultSchema = IssueDisruptionSchema.omit({
  updates: true,
});

const IssueDisruptionAugmentJsonSchema = zodToJsonSchema(
  IssueDisruptionAugmentResultSchema,
);

const ClassifyUpdateTypeResultSchema = z.object({
  type: IssueDisruptionUpdateTypeSchema,
  reason: z.string().describe('Explain briefly.'),
});

const ClassifyUpdateTypeResultJsonSchema = zodToJsonSchema(
  ClassifyUpdateTypeResultSchema,
);

async function classifyUpdateType(content: IngestContent) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
Your role is to help ingest the given post into an incidents system that tracks the MRT and LRT in Singapore.
Please classify the post into an update type.
Notes:
- Reddit posts are typically made by the general public
- Twitter/Mastodon posts are from the relevant transport operator/Land Transport Authority of Singapore.
- News sites (e.g. The Straits Times, CNA, Today) should be "news.report"
- "back to regular svc" is an indication of resolution
- use the "operator.monitoring" status when it seems that the operator has already applied a fix and is mentioning progressive resolution
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
        name: 'ClassifyUpdateTypeResult',
        strict: true,
        schema: ClassifyUpdateTypeResultJsonSchema,
      },
    },
  });

  const { message } = response.choices[0];
  messages.push(message);

  return ClassifyUpdateTypeResultSchema.parse(
    JSON.parse(message.content ?? ''),
  );
}

export async function ingestIssueDisruption(
  content: IngestContent,
  existingIssueId: string | null,
) {
  let issue: IssueDisruption;

  if (existingIssueId != null) {
    issue = IssueModel.getOne(existingIssueId) as IssueDisruption;
  } else {
    issue = {
      id: 'please-overwrite',
      type: 'disruption',
      componentIdsAffected: [],
      severity: 'major',
      title: 'please-overwrite',
      startAt: content.createdAt,
      endAt: null,
      updates: [],
    };
  }

  const updateType = await classifyUpdateType(content);
  console.log('[ingestContent.disruption.classifyUpdateType]', updateType);

  const updateIndex = issue.updates.findIndex(
    (upd) => upd.sourceUrl === content.url,
  );
  let text: string;
  switch (content.source) {
    case 'reddit': {
      text = await summarizeUpdate(content);
      console.log('[ingestContent.disruption.summarizeUpdate]', text);
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
  const update: IssueDisruptionUpdate = {
    type: updateType.type,
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
  - "id" field if it has the value "please-overwrite". It must follow the format! Do not overwrite if there is any other value.
  - "title" field
  - "startAt" field
  - "endAt" field if the disruption is considered finished.
  - "severity" field. It's "major" if service is disrupted, "minor" if there are only delays.
  - correct the "components" field based on the updates, see below for table.
    - recommendations to utilise other rail lines does not make them affected components.

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
        name: 'IssueDisruption',
        strict: true,
        schema: IssueDisruptionAugmentJsonSchema,
      },
    },
  });

  const { message } = response.choices[0];
  messages.push(message);

  try {
    const issueDisruption = IssueDisruptionAugmentResultSchema.parse(
      JSON.parse(message.content ?? ''),
    );

    issue = {
      ...issueDisruption,
      updates: issue.updates,
    };

    IssueModel.save(issue);

    if (existingIssueId != null && issue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueDisruption] saved', issue);
  } catch (e) {
    console.error(e);
    console.log('[ingestIssueDisruption] crash debug', messages);
  }
}
