import type { GenerateContentResponse } from '@google/genai';
import { type Content, createUserContent } from '@google/genai';
import { type Claim, ClaimSchema } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import z from 'zod';
import {
  GeminiUsageTracker,
  logGeminiUsageSummary,
  normalizeGeminiUsage,
} from '../../../helpers/geminiUsage.js';
import { assert } from '../../../util/assert.js';
import { getGeminiClient } from '../../client.js';
import {
  buildGeminiJsonConfig,
  getGeminiFunctionCalls,
  getGeminiModelContent,
  parseGeminiJsonResponse,
  toGeminiFunctionResponseContent,
} from '../../common/gemini.js';
import type { ToolRegistry } from '../../common/tool.js';
import { GEMINI_TRIAGE_MODEL } from '../../models.js';
import { normalizeClaimsForEvidence } from './normalizeClaimsForEvidence.js';
import { buildSystemPrompt } from './prompt.js';
import { FindLinesTool } from './tools/FindLinesTool.js';
import { FindServicesTool } from './tools/FindServicesTool.js';
import { FindStationsTool } from './tools/FindStationsTool.js';
import { ResolveRelativeDateTool } from './tools/ResolveRelativeDateTool.js';

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
  const evidenceTs = DateTime.fromISO(params.newEvidence.ts, {
    setZone: true,
  });
  assert(evidenceTs.isValid, `Invalid date: ${params.newEvidence.ts}`);

  const findStationsTool = new FindStationsTool(evidenceTs, params.repo);
  const findServicesTool = new FindServicesTool(evidenceTs, params.repo);
  const findLinesTool = new FindLinesTool(params.repo);
  const resolveRelativeDateTool = new ResolveRelativeDateTool();
  const toolRegistry: ToolRegistry = {
    [findStationsTool.name]: findStationsTool,
    [findServicesTool.name]: findServicesTool,
    [findLinesTool.name]: findLinesTool,
    [resolveRelativeDateTool.name]: resolveRelativeDateTool,
  };

  const context: Content[] = [
    createUserContent(
      `
Evidence: ${params.newEvidence.text}

Timestamp: ${evidenceTs.toISO({ includeOffset: true, suppressMilliseconds: true })}
`.trim(),
    ),
  ];

  const systemPrompt = buildSystemPrompt();
  const model = GEMINI_TRIAGE_MODEL;
  const usageTracker = new GeminiUsageTracker();

  let toolCallCount = 0;
  let reachedToolCallLimit = false;

  let response: GenerateContentResponse;
  do {
    response = await getGeminiClient().models.generateContent({
      model,
      contents: context,
      config: buildGeminiJsonConfig({
        systemPrompt,
        responseSchema: ResponseSchema,
        toolRegistry,
      }),
    });

    const modelContent = getGeminiModelContent(response);
    if (modelContent != null) {
      context.push(modelContent);
    }

    const functionCalls = getGeminiFunctionCalls(response);
    for (const functionCall of functionCalls) {
      assert(
        functionCall.name != null && functionCall.name.trim() !== '',
        'Gemini function call name is missing',
      );

      toolCallCount++;

      if (toolCallCount > TOOL_CALL_LIMIT) {
        context.push(
          toGeminiFunctionResponseContent({
            functionCall,
            output: 'Ran out of tool calls. Stop calling.',
          }),
        );
        console.log(
          'Forced short-circuit, returning error message in tool call result.',
        );
        reachedToolCallLimit = true;
        break;
      }

      if (functionCall.name in toolRegistry) {
        const tool = toolRegistry[functionCall.name];

        let parsedParams: unknown;

        try {
          parsedParams = tool.parseParams(functionCall.args ?? {});
        } catch (e) {
          console.error(
            `[extractClaimsFromNewEvidence] Error parsing parameters for tool "${functionCall.name}" with arguments "${JSON.stringify(functionCall.args ?? {})}":`,
            e,
          );
          context.push(
            toGeminiFunctionResponseContent({
              functionCall,
              output: `Invalid parameters for tool "${functionCall.name}". Please try again.`,
            }),
          );
          continue;
        }

        let result: string;

        try {
          result = await tool.runner(parsedParams);
        } catch (e) {
          console.error(
            `[extractClaimsFromNewEvidence] Error running tool "${functionCall.name}":`,
            e,
          );
          context.push(
            toGeminiFunctionResponseContent({
              functionCall,
              output: `Tool "${functionCall.name}" failed. Please continue without it or try a different call.`,
            }),
          );
          continue;
        }

        context.push(
          toGeminiFunctionResponseContent({ functionCall, output: result }),
        );
      } else {
        context.push(
          toGeminiFunctionResponseContent({
            functionCall,
            output: `Unknown tool "${functionCall.name}". Please use one of the available tools.`,
          }),
        );
      }
    }

    usageTracker.add(normalizeGeminiUsage(response.usageMetadata));
  } while (
    !reachedToolCallLimit &&
    getGeminiFunctionCalls(response).length > 0
  );

  logGeminiUsageSummary({
    label: 'extractClaimsFromNewEvidence',
    summary: usageTracker.summary(),
  });

  if (reachedToolCallLimit) {
    throw new Error(`Exceeded tool call limit of ${TOOL_CALL_LIMIT}`);
  }

  const parsed = parseGeminiJsonResponse(response, ResponseSchema);

  return {
    claims: normalizeClaimsForEvidence({
      claims: parsed.claims,
      evidenceTs: params.newEvidence.ts,
      repo: params.repo,
    }),
  };
}
