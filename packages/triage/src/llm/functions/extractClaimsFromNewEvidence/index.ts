import { type Claim, ClaimSchema } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import type {
  ParsedResponse,
  ResponseInputItem,
} from 'openai/resources/responses/responses.js';
import z from 'zod';
import {
  estimateOpenAICostFromUsage,
  normalizeOpenAIResponsesUsage,
} from '../../../helpers/estimateOpenAICost.js';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient } from '../../client.js';
import type { ToolRegistry } from '../../common/tool.js';
import { buildSystemPrompt } from './prompt.js';
import { FindLinesTool } from './tools/FindLinesTool.js';
import { FindServicesTool } from './tools/FindServicesTool.js';
import { FindStationsTool } from './tools/FindStationsTool.js';

const TOOL_CALL_LIMIT = 5;

const ResponseSchema = z.object({
  claims: z.array(ClaimSchema),
});

export interface ExtractClaimsFromNewEvidenceParams {
  newEvidence: {
    ts: string;
    text: string;
  };
  repo: MRTDownRepository;
}

export type ExtractClaimsFromNewEvidenceResult = {
  claims: Claim[];
};

/**
 * Extract claims from new evidence.
 * @param params
 * @returns
 */
export async function extractClaimsFromNewEvidence(
  params: ExtractClaimsFromNewEvidenceParams,
): Promise<ExtractClaimsFromNewEvidenceResult> {
  const evidenceTs = DateTime.fromISO(params.newEvidence.ts);
  assert(evidenceTs.isValid, `Invalid date: ${params.newEvidence.ts}`);

  const findStationsTool = new FindStationsTool(evidenceTs, params.repo);
  const findServicesTool = new FindServicesTool(evidenceTs, params.repo);
  const findLinesTool = new FindLinesTool(params.repo);
  const toolRegistry: ToolRegistry = {
    [findStationsTool.name]: findStationsTool,
    [findServicesTool.name]: findServicesTool,
    [findLinesTool.name]: findLinesTool,
  };

  const context: ResponseInputItem[] = [
    {
      role: 'user',
      content: `
Evidence: ${params.newEvidence.text}

Timestamp: ${evidenceTs.toISO({ includeOffset: true })}
`.trim(),
    },
  ];

  const systemPrompt = buildSystemPrompt();
  const model = 'gpt-5-mini';

  let toolCallCount = 0;

  let response: ParsedResponse<z.infer<typeof ResponseSchema>>;
  do {
    response = await getOpenAiClient().responses.parse({
      model,
      instructions: systemPrompt,
      input: context,
      reasoning: {
        effort: 'medium',
        summary: 'concise',
      },
      text: {
        format: {
          type: 'json_schema',
          name: 'Response',
          strict: true,
          schema: z.toJSONSchema(ResponseSchema),
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
    });

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

          if (toolCallCount > TOOL_CALL_LIMIT) {
            context.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: 'Ran out of tool calls. Stop Calling.',
            });
            console.log(
              'Forced short-circuit, returning error message in tool call result.',
            );
          }

          if (item.name in toolRegistry) {
            const tool = toolRegistry[item.name];

            let params: unknown;

            try {
              params = tool.parseParams(JSON.parse(item.arguments));
            } catch (e) {
              console.error(
                `[extractClaimsFromNewEvidence] Error parsing parameters for tool "${item.name}" with arguments "${item.arguments}":`,
                e,
              );
              context.push({
                type: 'function_call_output',
                call_id: item.call_id,
                output: `Invalid parameters for tool "${item.name}". Please try again.`,
              });
              continue;
            }

            // Call the tool's run function
            const result = await tool.runner(params);

            context.push({
              type: 'function_call_output',
              call_id: item.call_id,
              output: result,
            });
          }

          toolCallCount++;
          break;
        }
        default: {
          context.push(item);
          break;
        }
      }
    }

    const usage = normalizeOpenAIResponsesUsage(response.usage);
    const estimate = estimateOpenAICostFromUsage({ model, usage });
    if (usage != null) {
      console.log('[extractClaimsFromNewEvidence] Usage:', {
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
      if (estimate != null) {
        console.log(
          '[extractClaimsFromNewEvidence] Estimated cost (USD):',
          estimate.estimatedCostUsd.toFixed(8),
        );
      } else {
        console.log(
          `[extractClaimsFromNewEvidence] No pricing configured for model "${model}".`,
        );
      }
    } else {
      console.log('[extractClaimsFromNewEvidence] Usage is unavailable');
    }
  } while (response.output.some((item) => item.type === 'function_call'));

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
