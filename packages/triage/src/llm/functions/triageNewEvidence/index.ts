import type { GenerateContentResponse } from '@google/genai';
import { type Content, createUserContent } from '@google/genai';
import { IssueIdSchema, IssueTypeSchema } from '@mrtdown/core';
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
  toGeminiFunctionResponseContent,
} from '../../common/gemini.js';
import type { ToolRegistry } from '../../common/tool.js';
import { GEMINI_TRIAGE_MODEL } from '../../models.js';
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

  const context: Content[] = [
    createUserContent(
      `
Evidence: ${params.newEvidence.text}

Timestamp: ${evidenceTs.toISO({ includeOffset: true, suppressMilliseconds: true })}
`.trim(),
    ),
  ];

  let toolCallCount = 0;
  let reachedToolCallLimit = false;
  const model = GEMINI_TRIAGE_MODEL;
  const usageTracker = new GeminiUsageTracker();

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
            `[triageNewEvidence] Error parsing parameters for tool "${functionCall.name}" with arguments "${JSON.stringify(functionCall.args ?? {})}":`,
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
            `[triageNewEvidence] Error running tool "${functionCall.name}":`,
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

  if (reachedToolCallLimit) {
    response = await getGeminiClient().models.generateContent({
      model,
      contents: context,
      config: buildGeminiJsonConfig({
        systemPrompt: `${systemPrompt}

Tool-call budget is exhausted. Do not call more tools. Return the best schema-conforming final triage JSON using only the evidence and tool results already provided.`,
        responseSchema: ResponseSchema,
      }),
    });
    usageTracker.add(normalizeGeminiUsage(response.usageMetadata));
  }

  logGeminiUsageSummary({
    label: 'triageNewEvidence',
    summary: usageTracker.summary(),
  });

  return parseTriageResponse(response);
}

function parseTriageResponse(response: GenerateContentResponse) {
  const text = response.text;
  assert(text != null && text.trim() !== '', 'Gemini response text is empty');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Gemini response text is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return ResponseSchema.parse(normalizeTriageResponse(parsedJson));
}

function normalizeTriageResponse(value: unknown): unknown {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  const result = (value as { result?: unknown }).result;
  if (result == null || typeof result !== 'object') {
    return value;
  }

  const kind = (result as { kind?: unknown }).kind;
  if (typeof kind !== 'string') {
    return value;
  }

  const normalizedKind =
    {
      existing: 'part-of-existing-issue',
      existing_issue: 'part-of-existing-issue',
      'existing-issue': 'part-of-existing-issue',
      new: 'part-of-new-issue',
      new_issue: 'part-of-new-issue',
      'new-issue': 'part-of-new-issue',
      irrelevant: 'irrelevant-content',
      irrelevant_content: 'irrelevant-content',
    }[kind] ?? kind;

  if (normalizedKind === kind) {
    return value;
  }

  return {
    ...value,
    result: {
      ...result,
      kind: normalizedKind,
    },
  };
}
