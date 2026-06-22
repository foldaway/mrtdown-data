import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import { z } from 'zod';
import {
  logOpenAIUsageCostSummary,
  normalizeOpenAIResponsesUsage,
  OpenAIUsageCostTracker,
} from '../../../helpers/estimateOpenAICost.js';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient, runOpenAIRequestWithRetry } from '../../client.js';
import { toOpenAiJsonSchema } from '../../common/jsonSchema.js';
import { buildSystemPrompt } from './prompt.js';

export const ResponseSchema = z.object({
  title: z.string(),
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must contain lowercase alphanumeric segments separated by single hyphens',
    ),
});

export type GenerateIssueTitleAndSlugParams = {
  text: string;
};

export type GenerateIssueTitleAndSlugResult = z.infer<typeof ResponseSchema>;

/**
 * Generate a title and slug for the given text.
 */
export async function generateIssueTitleAndSlug(
  params: GenerateIssueTitleAndSlugParams,
): Promise<GenerateIssueTitleAndSlugResult> {
  const systemPrompt = buildSystemPrompt();
  const model = 'gpt-5.4-nano';
  const usageCostTracker = new OpenAIUsageCostTracker();

  const context: ResponseInputItem[] = [
    {
      role: 'user',
      content: `
Text: ${params.text}
`.trim(),
    },
  ];

  const response = await runOpenAIRequestWithRetry(
    () =>
      getOpenAiClient().responses.parse({
        model,
        input: context,
        instructions: systemPrompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'Response',
            strict: true,
            schema: toOpenAiJsonSchema(ResponseSchema),
          },
        },
        store: false,
      }),
    {
      label: 'generateIssueTitleAndSlug',
    },
  );

  const usage = normalizeOpenAIResponsesUsage(response.usage);
  usageCostTracker.add({ model, usage });
  logOpenAIUsageCostSummary({
    label: 'generateIssueTitleAndSlug',
    summary: usageCostTracker.summary(),
  });

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
