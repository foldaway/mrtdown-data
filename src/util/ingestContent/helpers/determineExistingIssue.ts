import { z } from 'zod';
import type { IngestContent } from '../types';
import { IssueIdSchema, IssueTypeSchema } from '../../../schema/Issue';
import { IssueModel } from '../../../model/IssueModel';
import { openAiClient } from '../constants';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from 'openai/resources';

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

export async function determineExistingIssue(
  content: IngestContent,
): Promise<Result> {
  let toolCallCount = 0;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
Your role is to help ingest the given post into an incidents system that tracks the MRT and LRT in Singapore.
Determine whether the post is part of an existing issue.
You can call the "searchIssues" tool once to get a list of all existing issues based on either the post date or the expected date.

Take Note:
- Both breakdowns and delays are considered "disruption" type issues.
- Service hour changes or station closures are considered "maintenance" issues.
- The rail line is very often mentioned in the post text. e.g. [BPLRT] refers to BPLRT rail line.
- Incidents typically only affect a single rail line, unless explicitly stated otherwise.
- There could be multiple incidents on the same rail line in the same day. If an existing incident already has "endAt" populated, a new one will be required for the post.
- Faults in one line are unrelated to other lines.
- When checking on existing issues:
  - date range must match up.
  - rail line is denoted in "componentIdsAffected"
  - check and ensure whether the post is relevant.
  - there could be multiple issues for the same rail line on the same day. check using the timestamps and stations mentioned
- The following cases are considered irrelevant:
  - Updates for bus services that are unrelated to MRT/LRT services
  - Extension of service hours for festivities (note - this is about ending later)


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
      model: 'gpt-4o-mini',
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Result',
          strict: true,
          schema: ResultJsonSchema,
        },
      },
      tools: [
        {
          type: 'function',
          function: {
            name: 'searchIssues',
            description: 'Fetch a list of issues across all rail lines',
            parameters: z.toJSONSchema(ToolSearchIssuesParametersSchema),
          },
        },
      ],
    });

    const { message } = response.choices[0];
    messages.push(message);

    const { tool_calls } = message;
    if (tool_calls != null) {
      for (const toolCall of tool_calls) {
        switch (toolCall.function.name) {
          case 'searchIssues': {
            console.log(
              `[ingest.determineExistingIssues] ${toolCall.id} calling tool "searchIssues" with params`,
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
              break;
            }
            const { dateMin, dateMax } = ToolSearchIssuesParametersSchema.parse(
              JSON.parse(toolCall.function.arguments),
            );
            const issues = IssueModel.getAllByOverlappingDateRange(
              dateMin,
              dateMax,
            );
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Here are the issues: ${JSON.stringify(issues)}`,
            });
            console.log(
              `[ingest.determineExistingIssues] ${toolCall.id} calling tool "searchIssues" returned ${issues.length} results.`,
            );
            break;
          }
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
