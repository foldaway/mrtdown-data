import { DateTime } from 'luxon';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import zodToJsonSchema from 'zod-to-json-schema';
import { IssueModel } from '../../../model/IssueModel';
import {
  type IssueInfra,
  IssueInfraSchema,
  type IssueInfraUpdate,
} from '../../../schema/Issue';
import { buildComponentTable } from '../buildComponentTable';
import { openAiClient } from '../constants';
import type { IngestContent } from '../types';
import { summarizeUpdate } from './summarizeUpdate';
import { z } from 'zod';
import {
  computeAffectedStations,
  LineSectionSchema,
} from '../../../helpers/computeAffectedStations';
import {
  TOOL_DEFINITION_STATION_SEARCH,
  TOOL_NAME_STATION_SEARCH,
  ToolStationSearchParametersSchema,
  toolStationSearchRun,
} from '../tools/stationSearch';

const MAX_TOOL_CALL_COUNT = 6;

const ResultSchema = z.object({
  issue: IssueInfraSchema.omit({
    updates: true,
  }),
  lineSections: z.array(LineSectionSchema),
});

const ResultJsonSchema = zodToJsonSchema(ResultSchema, {
  target: 'openAi',
  $refStrategy: 'none',
});

export async function ingestIssueInfra(
  content: IngestContent,
  existingIssueId: string | null,
) {
  let issue: IssueInfra;

  if (existingIssueId != null) {
    issue = IssueModel.getOne(existingIssueId) as IssueInfra;
  } else {
    issue = {
      id: 'please-overwrite',
      type: 'infra',
      componentIdsAffected: [],
      stationIdsAffected: [],
      title: 'please-overwrite',
      startAt: content.createdAt,
      endAt: null,
      updates: [],
      subtypes: [],
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
  const update: IssueInfraUpdate = {
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

  try {
    const updatedIssue = await augmentIssueInfra(issue);

    IssueModel.save(updatedIssue);

    if (existingIssueId != null && updatedIssue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueInfra] saved', updatedIssue);
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function augmentIssueInfra(issue: IssueInfra) {
  const { stationIdsAffected, ...otherProps } = issue;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
Your role is to help update this issue in an incidents system that tracks the MRT and LRT in Singapore.
This is the issue you are working on: ${JSON.stringify(otherProps)}.
Please modify the issue. You should:
- perform these updates if appropriate
  - "id" field if it has the value "please-overwrite". It must follow the format!
  - "title" field
  - "startAt" field
  - "endAt" field
  - "subtypes" field
  - correct the "components" field based on the updates, see below for table.
  - determine the affected section(s) of rail line(s).
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
      tools: [TOOL_DEFINITION_STATION_SEARCH],
    });

    const { message } = response.choices[0];
    messages.push(message);

    const { tool_calls } = message;
    if (tool_calls != null) {
      for (const toolCall of tool_calls) {
        switch (toolCall.function.name) {
          case TOOL_NAME_STATION_SEARCH: {
            console.log(
              `[ingest.infra] ${toolCall.id} calling tool "${TOOL_NAME_STATION_SEARCH}" with params`,
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
              break;
            }

            const params = ToolStationSearchParametersSchema.parse(
              JSON.parse(toolCall.function.arguments),
            );
            const result = await toolStationSearchRun(params);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
            console.log(
              `[ingest.infra] ${toolCall.id} calling tool "${TOOL_NAME_STATION_SEARCH}" finished.`,
            );
            break;
          }
        }
        toolCallCount++;
      }
    }
  } while (response.choices[0].message.tool_calls != null);

  try {
    const result = ResultSchema.parse(
      JSON.parse(response.choices[0].message.content ?? ''),
    );

    const updatedIssue: IssueInfra = {
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
    console.log('[augmentIssueInfra] crash debug', messages);
    throw e;
  }
}
