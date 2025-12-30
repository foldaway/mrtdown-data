import { DateTime } from 'luxon';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import { z } from 'zod';

import { IssueModel } from '../../../model/IssueModel.js';
import {
  type IssueDisruption,
  IssueDisruptionSchema,
  type IssueDisruptionUpdate,
  IssueDisruptionUpdateTypeSchema,
} from '../../../schema/Issue.js';
import { buildLineTable } from '../buildLineTable.js';
import { openAiClient } from '../constants.js';
import { TOOL_LINE_BRANCHES_GET } from '../tools/lineBranchesGet.js';
import { TOOL_STATION_SEARCH } from '../tools/stationSearch.js';
import type { IngestContent, ToolRegistry } from '../types.js';
import { summarizeUpdate } from './summarizeUpdate.js';
import { assert } from '../../assert.js';
import {
  computeAffectedStations,
  LineSectionSchema,
} from './computeAffectedStations.js';
import { TOOL_STATION_SEARCH_BY_LINE_ID } from '../tools/stationSearchByLineId.js';

const MAX_TOOL_CALL_COUNT = 6;

const ResultSchema = z.object({
  issue: IssueDisruptionSchema.omit({
    updates: true,
    stationIdsAffected: true,
  }),
  lineSections: z.array(LineSectionSchema),
});

const ResultJsonSchema = z.toJSONSchema(ResultSchema);

const ClassifyUpdateTypeResultSchema = z.object({
  type: IssueDisruptionUpdateTypeSchema,
  reason: z.string().describe('Explain briefly.'),
});

const ClassifyUpdateTypeResultJsonSchema = z.toJSONSchema(
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
    model: 'gpt-5-nano',
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
      lineIdsAffected: [],
      stationIdsAffected: [],
      subtypes: [],
      title: 'please-overwrite',
      title_translations: {
        'zh-Hans': 'please-overwrite',
        ms: 'please-overwrite',
        ta: 'please-overwrite',
      },
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
  [TOOL_STATION_SEARCH_BY_LINE_ID.name]: TOOL_STATION_SEARCH_BY_LINE_ID,
  [TOOL_LINE_BRANCHES_GET.name]: TOOL_LINE_BRANCHES_GET,
};

export async function augmentIssueDisruption(issue: IssueDisruption) {
  const { stationIdsAffected, ...otherProps } = issue;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are an AI assistant helping to process MRT/LRT service disruption data for Singapore's public transport system. Your task is to analyze social media posts, news articles, and official announcements to extract structured incident information.

CURRENT ISSUE: ${JSON.stringify(otherProps)}

## Your Responsibilities

### 1. Issue ID Generation
- **ONLY** update "id" field if current value is "please-overwrite"
- Format: YYYY-MM-DD-brief-descriptive-slug (e.g., "2024-01-15-nsl-signalling-fault")
- Use Singapore date (Asia/Singapore timezone)
- Keep slugs concise but descriptive
- Do NOT overwrite existing IDs

### 2. Title Creation
- Create clear, factual titles describing the disruption
- Format: "[Line Code] [Type of Issue] - [Location/Scope]"
- Examples: "NSL Signalling Fault - Ang Mo Kio to Bishan", "EWL Train Breakdown - Clementi Station"
- Avoid sensational language; stick to facts

### 3. Time Management
- **startAt**: When the disruption actually began (not when reported)
- **endAt**: When service fully resumed (set to null if ongoing)
- Consider Singapore timezone (Asia/Singapore)
- Look for phrases like "since 8am", "from 9:30am", "service resumed at 2pm"

### 4. Line Identification
- Identify affected MRT/LRT lines based on content
- **Key Rule**: Recommendations to use alternative lines do NOT make them affected
- Focus on lines experiencing actual service issues
- Use line IDs from the table below

### 5. Line Section Mapping
- Determine specific track sections affected by the disruption
- Do NOT include stations only mentioned for shuttle services or alternatives
- If no specific stations mentioned, assume entire line/branch affected
- Format sections as: startStationId → endStationId

### 6. Subtype Classification
Choose from: signal, train-fault, power, track, platform, crowding, external, security, weather, other

## Singapore MRT/LRT Context
- **Peak Hours**: 7-9am, 6-8pm weekdays
- **Service Hours**: ~5:30am-12:30am daily
- **Common Terms**:
  - "train fault" = mechanical/technical issues
  - "signalling issues" = signal system problems
  - "power trip" = electrical failures
  - "platform screen doors" = safety barriers
  - "free regular/bridging service" = bus replacement

## Content Source Interpretation
- **Official sources** (SMRT, SBS Transit, LTA): Most accurate timing and technical details
- **News sites**: Generally reliable, may have slight delays
- **Social media**: Real-time but may lack precision, verify against other sources
- **Reddit posts**: User experiences, good for impact assessment

# Lines Table
${buildLineTable()}

## Output Requirements
- Provide factual, structured data based on evidence in the updates
- If information is unclear or missing, make reasonable inferences based on Singapore MRT patterns
- Prioritize accuracy over completeness
`.trim(),
    },
  ];

  let response: ChatCompletion;
  let toolCallCount = 0;

  do {
    response = await openAiClient.chat.completions.create({
      model: 'gpt-5-mini',
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
            parameters: z.toJSONSchema(tool.paramSchema),
          },
        };
      }),
    });

    const { message } = response.choices[0];
    messages.push(message);

    const { tool_calls } = message;
    if (tool_calls != null) {
      for (const toolCall of tool_calls) {
        assert(toolCall.type === 'function');

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
      stationIdsAffected: await computeAffectedStations(
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
