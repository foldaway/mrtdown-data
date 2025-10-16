import { DateTime } from 'luxon';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import * as z from 'zod';
import { IssueModel } from '../../../model/IssueModel.js';
import {
  type IssueInfra,
  IssueInfraSchema,
  type IssueInfraUpdate,
} from '../../../schema/Issue.js';
import { buildComponentTable } from '../buildComponentTable.js';
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
  issue: IssueInfraSchema.omit({
    updates: true,
    stationIdsAffected: true,
  }),
  lineSections: z.array(LineSectionSchema),
});

const ResultJsonSchema = z.toJSONSchema(ResultSchema);

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
      title_translations: {
        'zh-Hans': 'please-overwrite',
        ms: 'please-overwrite',
        ta: 'please-overwrite',
      },
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

const toolRegistry: ToolRegistry = {
  [TOOL_STATION_SEARCH.name]: TOOL_STATION_SEARCH,
  [TOOL_STATION_SEARCH_BY_LINE_ID.name]: TOOL_STATION_SEARCH_BY_LINE_ID,
  [TOOL_LINE_BRANCHES_GET.name]: TOOL_LINE_BRANCHES_GET,
};

export async function augmentIssueInfra(issue: IssueInfra) {
  const { stationIdsAffected, ...otherProps } = issue;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are an AI assistant helping to process MRT/LRT infrastructure-related issues for Singapore's public transport system. These are long-term structural, facility, or permanent infrastructure problems that affect service delivery but are distinct from operational disruptions or maintenance activities.

CURRENT ISSUE: ${JSON.stringify(otherProps)}

## Your Responsibilities

### 1. Issue ID Generation
- **ONLY** update "id" field if current value is "please-overwrite"
- Format: YYYY-MM-DD-brief-descriptive-slug (e.g., "2024-01-15-nsl-lift-replacement")
- Use Singapore date (Asia/Singapore timezone)
- Focus on infrastructure component/location affected
- Keep slugs descriptive but concise

### 2. Title Creation
- Create clear titles describing the infrastructure issue
- Format: "[Line Code] [Infrastructure Component] [Issue Type] - [Location]"
- Examples: "NSL Lift Replacement - Ang Mo Kio Station", "EWL Platform Screen Door Upgrade"
- Focus on permanent/semi-permanent infrastructure changes or problems

### 3. Infrastructure Issue Classification
These issues typically involve:
- **Station facilities**: Lifts, escalators, platforms, gates, screens
- **Accessibility improvements**: Barrier-free access, tactile guidance
- **Infrastructure upgrades**: Platform extensions, structural modifications
- **Facility replacements**: Long-term equipment replacement programs
- **Structural issues**: Building, platform, track bed problems requiring extended work

### 4. Time Management
- **startAt**: When infrastructure work/problem began affecting service
- **endAt**: When infrastructure is fully restored/completed (null if ongoing project)
- Consider that infrastructure projects often span weeks/months
- Look for project timelines, completion estimates
- Singapore timezone (Asia/Singapore)

### 5. Component & Section Identification
- Identify specific MRT/LRT lines with infrastructure issues
- Focus on structural/facility impacts rather than operational disruptions
- Map affected stations or line sections with infrastructure problems
- Infrastructure issues may affect entire stations rather than just track sections

### 6. Subtype Classification
Choose from infrastructure-specific categories:
- **accessibility**: Lifts, ramps, tactile systems, barrier-free access
- **platform**: Platform structure, extensions, screen doors
- **station**: Station building, facilities, amenities
- **escalator**: Escalator installation, replacement, major repairs
- **lift**: Lift installation, replacement, major overhauls
- **structural**: Building structure, foundations, major construction
- **systems**: Station systems (air-con, lighting, communications)
- **other**: Other infrastructure work

## Singapore MRT Infrastructure Context
- **Accessibility Compliance**: Ongoing program to make all stations barrier-free
- **Platform Screen Doors**: Retrofit program across older lines
- **Station Upgrades**: Regular facility improvements and modernization
- **Lift/Escalator Programs**: Systematic replacement of aging equipment
- **Infrastructure Lifecycle**: Major components have 20-30 year lifespans
- **Regulatory Requirements**: Building codes, accessibility standards drive upgrades

## Infrastructure vs. Other Issue Types
- **Infrastructure**: Permanent facility changes, structural work, major equipment replacement
- **Maintenance**: Routine upkeep, repairs, system testing (separate category)
- **Disruption**: Operational service interruptions, train faults (separate category)

## Content Source Interpretation
- **Official announcements**: Primary source for infrastructure project details
- **Tender notices**: Early indicators of upcoming infrastructure work
- **News reports**: Public interest in major infrastructure projects
- **User feedback**: Impact reports from facility changes

# Components Table
${buildComponentTable()}

## Output Requirements
- Distinguish infrastructure issues from operational disruptions or routine maintenance
- Focus on structural, facility, and permanent system changes
- Capture long-term project timelines accurately
- Provide context for how infrastructure work impacts service delivery
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
          `[ingest.infra] ${toolCall.id} calling tool "${toolCall.function.name}" with params`,
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
            `[ingest.infra] ${toolCall.id} calling tool "${toolCall.function.name}" finished.`,
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

    const updatedIssue: IssueInfra = {
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
    console.log('[augmentIssueInfra] crash debug', messages);
    throw e;
  }
}
