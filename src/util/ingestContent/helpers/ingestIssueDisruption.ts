import { DateTime } from 'luxon';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import {
  computeAffectedStations,
  LineSectionSchema,
} from '../../../helpers/computeAffectedStations';
import { IssueModel } from '../../../model/IssueModel';
import {
  type IssueDisruption,
  IssueDisruptionSchema,
  type IssueDisruptionUpdate,
  IssueDisruptionUpdateTypeSchema,
} from '../../../schema/Issue';
import { buildComponentTable } from '../buildComponentTable';
import { openAiClient } from '../constants';
import { TOOL_COMPONENT_BRANCHES_GET } from '../tools/componentBranchesGet';
import { TOOL_STATION_SEARCH } from '../tools/stationSearch';
import { TOOL_STATION_SEARCH_BY_COMPONENT_ID } from '../tools/stationSearchByComponentId';
import type { IngestContent, ToolRegistry } from '../types';
import { summarizeUpdate } from './summarizeUpdate';

const MAX_TOOL_CALL_COUNT = 6;

const ResultSchema = z.object({
  issue: IssueDisruptionSchema.omit({
    updates: true,
  }),
  lineSections: z.array(LineSectionSchema),
});

const ResultJsonSchema = zodToJsonSchema(ResultSchema, {
  target: 'openAi',
  $refStrategy: 'none',
});

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
      stationIdsAffected: [],
      subtypes: [],
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

  const updatedIssue = await augmentIssueDisruption(issue);

  try {
    IssueModel.save(updatedIssue);
    if (existingIssueId != null && updatedIssue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueDisruption] saved', updatedIssue);
  } catch (e) {}
}

const toolRegistry: ToolRegistry = {
  [TOOL_STATION_SEARCH.name]: TOOL_STATION_SEARCH,
  [TOOL_STATION_SEARCH_BY_COMPONENT_ID.name]:
    TOOL_STATION_SEARCH_BY_COMPONENT_ID,
  [TOOL_COMPONENT_BRANCHES_GET.name]: TOOL_COMPONENT_BRANCHES_GET,
};

export async function augmentIssueDisruption(issue: IssueDisruption) {
  const { stationIdsAffected, ...otherProps } = issue;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
Your role is to help update this issue in an incidents system that tracks the MRT and LRT in Singapore.
This is the issue you are working on: ${JSON.stringify(otherProps)}.
Please modify the issue. You should:
- perform these updates if appropriate
  - "id" field if it has the value "please-overwrite". It must follow the format! Do not overwrite if there is any other value.
  - "title" field
  - "startAt" field
  - "endAt" field if the disruption is considered finished.
  - "subtypes" field.
  - correct the "components" field based on the updates, see below for table.
    - recommendations to utilise other rail lines does not make them affected components.
  - determine the affected section(s) of rail line(s) that went out of service. include only out of service stations.
  - leave the "stationIdsAffected" field as empty.

# Components table
${buildComponentTable()}
`.trim(),
    },
  ];

  let response: ChatCompletion;
  let toolCallCount = 0;

  do {
    response = await openAiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        ...messages,
        {
          role: 'system',
          content: `You have ${MAX_TOOL_CALL_COUNT - toolCallCount} tool calls remaining.`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Result',
          strict: true,
          schema: ResultJsonSchema,
        },
      },
      tools: Object.values(toolRegistry).map((tool) => {
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: zodToJsonSchema(tool.paramSchema, {
              target: 'openAi',
            }),
          },
        };
      }),
    });

    const { message } = response.choices[0];
    messages.push(message);

    const { tool_calls } = message;
    if (tool_calls != null) {
      for (const toolCall of tool_calls) {
        console.log(
          `[ingest.disruption] ${toolCall.id} calling tool "${toolCall.function.name}" with params`,
          toolCall.function.arguments,
        );

        if (toolCallCount > MAX_TOOL_CALL_COUNT) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Ran out of tool calls. Stop Calling.',
          });
          console.log(
            'Forced short-circuit, returning error message in tool call result.',
          );
          continue;
        }

        if (toolCall.function.name in toolRegistry) {
          const tool = toolRegistry[toolCall.function.name];

          const params = tool.paramSchema.parse(
            JSON.parse(toolCall.function.arguments),
          );
          const result = await tool.runner(params);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
          console.log(
            `[ingest.disruption] ${toolCall.id} calling tool "${toolCall.function.name}" finished.`,
          );
        }
        toolCallCount++;
      }
    }
  } while (response.choices[0].message.tool_calls != null);

  try {
    const result = ResultSchema.parse(
      JSON.parse(response.choices[0].message.content ?? ''),
    );

    const updatedIssue: IssueDisruption = {
      ...result.issue,
      updates: issue.updates,
      stationIdsAffected: computeAffectedStations(
        result.lineSections,
        result.issue.startAt,
      ),
    };

    return updatedIssue;
  } catch (e) {
    console.error(e);
    console.log('[augmentIssueDisruption] crash debug', messages);
    throw e;
  }
}
