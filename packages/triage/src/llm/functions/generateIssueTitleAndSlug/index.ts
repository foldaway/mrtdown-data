import type { ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import { z } from 'zod';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient } from '../../client.js';
import { buildSystemPrompt } from './prompt.js';

const ResponseSchema = z.object({
  title: z.string(),
  slug: z.string(),
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

  const context: ResponseInputItem[] = [
    {
      role: 'user',
      content: `
Text: ${params.text}
`.trim(),
    },
  ];

  const response = await getOpenAiClient().responses.parse({
    model: 'gpt-5-nano',
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
  });

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
