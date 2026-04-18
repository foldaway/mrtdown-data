import { DateTime } from 'luxon';
import type {
  ParsedResponse,
  ResponseInputItem,
} from 'openai/resources/responses/responses.mjs';
import z from 'zod';
import { openAiClient } from '#llm/client.js';
import type { MRTDownRepository } from '#repo/MRTDownRepository.js';
import { IssueIdSchema } from '#schema/issue/id.js';
import { IssueTypeSchema } from '#schema/issue/issueType.js';
import { assert } from '#util/assert.js';
import type { ToolRegistry } from '../../common/tool.js';
import { buildSystemPrompt } from './prompt.js';
import { FindIssuesTool } from './tools/FindIssuesTool.js';
import { GetIssueTool } from './tools/GetIssueTool.js';

const TOOL_CALL_LIMIT = 5;

const ResponseSchema = z.object({
  result: z.discriminatedUnion('type', [
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
  const evidenceTs = DateTime.fromISO(params.newEvidence.ts);
  assert(evidenceTs.isValid, `Invalid date: ${params.newEvidence.ts}`);

  const findIssuesTool = new FindIssuesTool(params.repo);
  const getIssueTool = new GetIssueTool(params.repo);
  const toolRegistry: ToolRegistry = {
    [findIssuesTool.name]: findIssuesTool,
    [getIssueTool.name]: getIssueTool,
  };

  const systemPrompt = buildSystemPrompt();

  const context: ResponseInputItem[] = [
    {
      role: 'user',
      content: `
Evidence: ${params.newEvidence.text}

Timestamp: ${evidenceTs.toISO({ includeOffset: true })}
`.trim(),
    },
  ];

  let toolCallCount = 0;

  let response: ParsedResponse<z.infer<typeof ResponseSchema>>;
  do {
    response = await openAiClient.responses.parse({
      model: 'gpt-5-mini',
      input: context,
      instructions: systemPrompt,
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

            const params = tool.parseParams(JSON.parse(item.arguments));
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
  } while (response.output.some((item) => item.type === 'function_call'));

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
