import { DateTime } from 'luxon';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import { z } from 'zod';
import { IssueModel } from '../../../model/IssueModel.js';
import {
  type IssueMaintenance,
  IssueMaintenanceSchema,
  type IssueMaintenanceUpdate,
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
  issue: IssueMaintenanceSchema.omit({
    updates: true,
    stationIdsAffected: true,
    rrule: true,
  }),
  lineSections: z.array(LineSectionSchema),
});

const ResultJsonSchema = z.toJSONSchema(ResultSchema);

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
      stationIdsAffected: [],
      title: 'please-overwrite',
      title_translations: {
        'zh-Hans': 'please-overwrite',
        ms: 'please-overwrite',
        ta: 'please-overwrite',
      },
      startAt: content.createdAt,
      cancelledAt: null,
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

  try {
    const updatedIssue = await augmentIssueMaintenance(issue);
    IssueModel.save(updatedIssue);

    if (existingIssueId != null && updatedIssue.id !== existingIssueId) {
      IssueModel.delete(existingIssueId);
    }
    console.log('[ingestIssueMaintenance] saved', updatedIssue);
  } catch (e) {
    console.error(e);
  }
}

const toolRegistry: ToolRegistry = {
  [TOOL_STATION_SEARCH.name]: TOOL_STATION_SEARCH,
  [TOOL_STATION_SEARCH_BY_LINE_ID.name]: TOOL_STATION_SEARCH_BY_LINE_ID,
  [TOOL_LINE_BRANCHES_GET.name]: TOOL_LINE_BRANCHES_GET,
};

export async function augmentIssueMaintenance(issue: IssueMaintenance) {
  const { stationIdsAffected, ...otherProps } = issue;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are an AI assistant helping to process MRT/LRT maintenance data for Singapore's public transport system. Your task is to analyze announcements about planned and unplanned maintenance activities.

CURRENT ISSUE: ${JSON.stringify(otherProps)}

## Your Responsibilities

### 1. Issue ID Generation
- **ONLY** update "id" field if current value is "please-overwrite" OR if date doesn't match "startAt"
- Format: YYYY-MM-DD-brief-descriptive-slug (e.g., "2024-01-15-nsl-track-renewal")
- Use Singapore date (Asia/Singapore timezone) based on startAt
- Keep slugs descriptive of maintenance type and scope

### 2. Title Creation
- Create descriptive titles indicating maintenance type and scope
- Format: "[Line Code] [Maintenance Type] - [Location/Scope]"
- Examples: "NSL Track Renewal - Yio Chu Kang to Ang Mo Kio", "EWL Signaling System Upgrade"
- Use technical terms when appropriate (renewal, replacement, upgrade, inspection)

### 3. Maintenance Classification (Critical Decision)

#### **PLANNED MAINTENANCE** Indicators:
- Advance announcements (days/weeks ahead)
- Specific scheduled times mentioned
- Future tense language ("will be", "scheduled for")
- Regular/routine maintenance cycles
- Infrastructure upgrades or renewals
- **Timing**: startAt = scheduled start, endAt = scheduled completion

#### **AD-HOC MAINTENANCE** Indicators:
- Urgent language ("immediate", "emergency")
- Past tense ("has been", "was discovered")
- Fault-related terms ("repair", "fix", "rectify")
- Unplanned disruptions requiring maintenance
- **Timing**: startAt = when maintenance began, endAt = end of service day if not specified

### 4. Time Management
- **startAt**:
  - Planned: Scheduled start time
  - Ad-hoc: When maintenance actually began
- **endAt**:
  - Planned: Scheduled completion time
  - Ad-hoc: End of service day (23:59) if not specified, actual completion if known
- **cancelledAt**: Set if announcement indicates cancellation of planned maintenance
- All times in Singapore timezone (Asia/Singapore)

### 5. Component & Section Identification
- Identify affected MRT/LRT lines requiring maintenance
- Map specific track sections, stations, or entire lines
- Consider scope of work described in updates
- No specific stations mentioned often means entire line/branch affected

### 6. Subtype Classification
Choose appropriate maintenance categories:
- **track**: Rail, ballast, sleeper work
- **signal**: Signaling system work
- **power**: Electrical systems, third rail
- **platform**: Platform upgrades, screen doors
- **train**: Rolling stock maintenance
- **infrastructure**: General facility work
- **testing**: System testing, commissioning
- **other**: Miscellaneous maintenance

## Singapore MRT Maintenance Context
- **Engineering Hours**: Typically 1:00am-4:30am when no passenger service
- **Weekend Closures**: Common for major works (Sat night to Sun morning)
- **Advance Notice**: Planned works announced 1-2 weeks prior
- **Replacement Services**: Free regular/bridging bus services provided
- **Common Maintenance**: Track renewal, signaling upgrades, platform improvements

## Content Source Interpretation
- **Official sources** (SMRT, SBS Transit, LTA): Primary source for maintenance schedules
- **News articles**: Secondary reporting, may have timing discrepancies
- **Social media**: Real-time updates, user reports of maintenance impact

# Components Table
${buildComponentTable()}

## Output Requirements
- Accurately classify as planned vs ad-hoc based on linguistic cues and context
- Set appropriate time boundaries based on maintenance type
- Provide structured data reflecting Singapore MRT operational patterns
- When in doubt about timing, err on the side of planned maintenance for advance announcements
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
          `[ingest.maintenance] ${toolCall.id} calling tool "${toolCall.function.name}" with params`,
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
            `[ingest.maintenance] ${toolCall.id} calling tool "${toolCall.function.name}" finished.`,
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

    const updatedIssue: IssueMaintenance = {
      ...result.issue,
      rrule: issue.rrule,
      updates: issue.updates,
      stationIdsAffected: await computeAffectedStations(
        result.lineSections,
        result.issue.startAt,
      ),
    };
    return updatedIssue;
  } catch (e) {
    console.error(e);
    console.log('[augmentIssueMaintenance] crash debug', messages);
    throw e;
  }
}
