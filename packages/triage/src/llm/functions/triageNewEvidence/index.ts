import { IssueIdSchema, IssueTypeSchema } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import type {
  ParsedResponse,
  ResponseInputItem,
} from 'openai/resources/responses/responses.mjs';
import z from 'zod';
import {
  logOpenAIUsageCostSummary,
  normalizeOpenAIResponsesUsage,
  OpenAIUsageCostTracker,
} from '../../../helpers/estimateOpenAICost.js';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient, runOpenAIRequestWithRetry } from '../../client.js';
import { toOpenAiJsonSchema } from '../../common/jsonSchema.js';
import type { ToolRegistry } from '../../common/tool.js';
import { buildSystemPrompt } from './prompt.js';
import { FindIssuesByDateRangeTool } from './tools/FindIssuesByDateRangeTool.js';
import { FindIssuesTool } from './tools/FindIssuesTool.js';
import { GetIssueTool } from './tools/GetIssueTool.js';

const TOOL_CALL_LIMIT = 8;

const ResponseSchema = z.object({
  result: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('part-of-existing-issue'),
      issueId: IssueIdSchema,
    }),
    z.object({
      kind: z.literal('part-of-new-issue'),
      issueType: IssueTypeSchema,
    }),
    z.object({
      kind: z.literal('irrelevant-content'),
    }),
  ]),
});

export type TriageNewEvidenceParams = {
  newEvidence: {
    ts: string;
    text: string;
  };
  repo: MRTDownRepository;
};

export type TriageNewEvidenceResult = z.infer<typeof ResponseSchema>;

export async function triageNewEvidence(params: TriageNewEvidenceParams) {
  const evidenceTs = DateTime.fromISO(params.newEvidence.ts, {
    setZone: true,
  });
  assert(evidenceTs.isValid, `Invalid date: ${params.newEvidence.ts}`);

  const findIssuesTool = new FindIssuesTool(params.repo);
  const findIssuesByDateRangeTool = new FindIssuesByDateRangeTool(params.repo);
  const getIssueTool = new GetIssueTool(params.repo);
  const toolRegistry: ToolRegistry = {
    [findIssuesTool.name]: findIssuesTool,
    [findIssuesByDateRangeTool.name]: findIssuesByDateRangeTool,
    [getIssueTool.name]: getIssueTool,
  };

  const systemPrompt = buildSystemPrompt();

  const context: ResponseInputItem[] = [
    {
      role: 'user',
      content: `
Evidence: ${params.newEvidence.text}

Timestamp: ${evidenceTs.toISO({ includeOffset: true, suppressMilliseconds: true })}
`.trim(),
    },
  ];

  let toolCallCount = 0;
  let reachedToolCallLimit = false;
  const model = 'gpt-5.4-mini';
  const usageCostTracker = new OpenAIUsageCostTracker();

  let response: ParsedResponse<z.infer<typeof ResponseSchema>>;
  do {
    response = await runOpenAIRequestWithRetry(
      () =>
        getOpenAiClient().responses.parse({
          model,
          input: context,
          instructions: systemPrompt,
          temperature: 0,
          reasoning: {
            effort: 'low',
          },
          text: {
            format: {
              type: 'json_schema',
              name: 'Response',
              strict: true,
              schema: toOpenAiJsonSchema(ResponseSchema),
            },
          },
          tools: Object.values(toolRegistry).map((tool) => {
            return {
              type: 'function',
              name: tool.name,
              description: tool.description,
              parameters: tool.paramsSchema,
              strict: true,
            };
          }),
          // Don't persist conversation with OpenAI, but include reasoning content to
          // continue the thread with the same reasoning.
          store: false,
          include: ['reasoning.encrypted_content'],
        }),
      {
        label: 'triageNewEvidence',
      },
    );

    for (const item of response.output) {
      switch (item.type) {
        case 'function_call': {
          /**
           * Prevent the `parsed_arguments` field from being included
           * https://github.com/openai/openai-python/issues/2374
           */
          context.push({
            type: 'function_call',
            id: item.id,
            call_id: item.call_id,
            name: item.name,
            arguments: item.arguments,
          });
          toolCallCount++;

          if (toolCallCount > TOOL_CALL_LIMIT) {
            context.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: 'Ran out of tool calls. Stop Calling.',
            });
            console.log(
              'Forced short-circuit, returning error message in tool call result.',
            );
            reachedToolCallLimit = true;
            break;
          }

          if (item.name in toolRegistry) {
            const tool = toolRegistry[item.name];

            let params: unknown;

            try {
              params = tool.parseParams(JSON.parse(item.arguments));
            } catch (e) {
              console.error(
                `[triageNewEvidence] Error parsing parameters for tool "${item.name}" with arguments "${item.arguments}":`,
                e,
              );
              context.push({
                type: 'function_call_output',
                call_id: item.call_id,
                output: `Invalid parameters for tool "${item.name}". Please try again.`,
              });
              continue;
            }

            let result: string;

            try {
              result = await tool.runner(params);
            } catch (e) {
              console.error(
                `[triageNewEvidence] Error running tool "${item.name}":`,
                e,
              );
              context.push({
                type: 'function_call_output',
                call_id: item.call_id,
                output: `Tool "${item.name}" failed. Please continue without it or try a different call.`,
              });
              continue;
            }

            context.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: result,
            });
          } else {
            context.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: `Unknown tool "${item.name}". Please use one of the available tools.`,
            });
          }

          break;
        }
        default: {
          context.push(item as ResponseInputItem);
          break;
        }
      }

      if (reachedToolCallLimit) {
        break;
      }
    }

    const usage = normalizeOpenAIResponsesUsage(response.usage);
    usageCostTracker.add({ model, usage });
  } while (
    !reachedToolCallLimit &&
    response.output.some((item) => item.type === 'function_call')
  );

  logOpenAIUsageCostSummary({
    label: 'triageNewEvidence',
    summary: usageCostTracker.summary(),
  });

  if (reachedToolCallLimit) {
    throw new Error(`Exceeded tool call limit of ${TOOL_CALL_LIMIT}`);
  }

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
