import { z } from 'zod';
import type { IngestContent, ToolRegistry } from '../types.js';
import { IssueIdSchema, IssueTypeSchema } from '../../../schema/Issue.js';
import { openAiClient } from '../constants.js';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';
import { assert } from '../../assert.js';
import { lineGetAllQuery } from '../queries/lineGetAll.js';
import { TOOL_ISSUE_SEARCH } from '../tools/issueSearch.js';

const ResultSchema = z.object({
  result: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('related-to-existing-issue'),
      issueId: IssueIdSchema,
    }),
    z.object({
      type: z.literal('create-new-issue'),
      issueType: IssueTypeSchema,
    }),
    z.object({
      type: z.literal('irrelevant-content'),
    }),
  ]),
  reason: z.string().describe('Explain why in less than 20 words'),
});
type Result = z.infer<typeof ResultSchema>;
const ResultJsonSchema = z.toJSONSchema(ResultSchema);

const ToolSearchIssuesParametersSchema = z.object({
  dateMin: z.string().date(),
  dateMax: z.string().date(),
  reason: z.string(),
});

const toolRegistry: ToolRegistry = {
  [TOOL_ISSUE_SEARCH.name]: TOOL_ISSUE_SEARCH,
};

export async function determineExistingIssue(
  content: IngestContent,
): Promise<Result> {
  let toolCallCount = 0;

  const lineGetAllQueryRows = await lineGetAllQuery();

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are an expert system for ingesting MRT/LRT service posts into Singapore's rail incident tracking system.

Your task: Determine if the given post relates to an existing issue, requires a new issue, or is irrelevant.

DECISION PROCESS:
1. Use searchIssues tool to fetch recent issues (search within ±2 days of post date)
2. Analyze the post content and compare with existing issues
3. Return appropriate classification with clear reasoning

CLASSIFICATION RULES:

RELATED TO EXISTING ISSUE:
- Same rail line AND similar time period AND issue still ongoing (endAt is null)
- Post provides updates, resolution, or continuation of existing incident
- Stations mentioned align with existing issue's affected areas

CREATE NEW ISSUE:
- Disruption types: breakdowns, delays, signal faults, train faults, service slowdowns
- Maintenance types: planned closures, service hour changes, station renovations, track work
- Infrastructure types: permanent changes, new stations, line extensions
- Different rail line from existing issues
- Same rail line but existing issue has ended (endAt populated)
- Same rail line but different stations/timeframe indicating separate incident

IRRELEVANT CONTENT:
- Bus service updates unrelated to MRT/LRT
- General announcements without service impact
- Promotional content or non-operational news
- Service hour extensions for festivities (extending operating hours later)

KEY CONTEXT:
- Rail lines: ${lineGetAllQueryRows.map((line) => `${line.component_id}`).join(', ')}
- Line codes in brackets: [NSL], [BPLRT], etc.
- Issues typically affect single lines unless explicitly multi-line
- componentIdsAffected field shows which rail lines are impacted
- Multiple incidents can occur on same line if they're separate events or timeframes
- Check timestamps carefully - ongoing issues (endAt: null) can receive updates

SEARCH STRATEGY:
Search ±2 days from post date to capture related incidents that may have started earlier or could extend beyond the post date.
`.trim(),
    },
    {
      role: 'user',
      content: JSON.stringify(content),
    },
  ];
  let response: ChatCompletion;
  do {
    response = await openAiClient.chat.completions.create({
      model: 'gpt-5-mini',
      messages,
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
          `[ingest.determineExistingIssue] ${toolCall.id} calling tool "${toolCall.function.name}" with params`,
          toolCall.function.arguments,
        );

        if (toolCallCount > 2) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Ran out of tool calls. Stop Calling.',
          });
          console.log(
            'Forced short-circuit, returning error message in tool call result.',
          );
        }

        if (toolCall.function.name in toolRegistry) {
          const tool = toolRegistry[toolCall.function.name];

          const params = tool.paramSchema.parse(
            JSON.parse(toolCall.function.arguments),
          );
          // Call the tool's run function
          const result = await tool.runner(params);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });

          console.log(
            `[ingest.determineExistingIssue] ${toolCall.id} calling tool "${toolCall.function.name}" returned result`,
            result,
          );
        }

        toolCallCount++;
      }
    }
  } while (response.choices[0].message.tool_calls != null);

  const result = ResultSchema.parse(
    JSON.parse(response.choices[0].message.content ?? ''),
  );
  return result;
}
