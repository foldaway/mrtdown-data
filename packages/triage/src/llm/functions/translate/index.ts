import { TranslationsSchema } from '@mrtdown/core';
import type { ResponseInputItem } from 'openai/resources/responses/responses.js';
import { z } from 'zod';
import {
  estimateOpenAICostFromUsage,
  normalizeOpenAIResponsesUsage,
} from '../../../helpers/estimateOpenAICost.js';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient } from '../../client.js';

export async function translate(text: string) {
  console.log('[translate] Translating text:', text);
  const model = 'gpt-5-nano';

  const context: ResponseInputItem[] = [{ role: 'user', content: text }];

  const response = await getOpenAiClient().responses.parse({
    model,
    input: context,
    instructions:
      `You are a helpful assistant that translates text to the following languages:
- English
- Chinese (Simplified)
- Malay
- Tamil

These translations relate to transit disruption/maintenance/infrastructure issues and can contain names of lines and/or stations.
Keep the names in English as much as possible, do not provide any translations for them.
`.trim(),
    text: {
      format: {
        type: 'json_schema',
        name: 'Translation',
        strict: true,
        schema: z.toJSONSchema(TranslationsSchema),
      },
    },
    reasoning: {
      effort: 'minimal',
      summary: 'concise',
    },
    store: false,
    include: ['reasoning.encrypted_content'],
  });

  const usage = normalizeOpenAIResponsesUsage(response.usage);
  const estimate = estimateOpenAICostFromUsage({ model, usage });
  if (usage != null) {
    console.log('[translate] Usage:', {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    });
    if (estimate != null) {
      console.log(
        '[translate] Estimated cost (USD):',
        estimate.estimatedCostUsd.toFixed(8),
      );
    } else {
      console.log(`[translate] No pricing configured for model "${model}".`);
    }
  } else {
    console.log('[translate] Usage is unavailable');
  }

  assert(response.output_parsed != null, 'Response output parsed is null');

  return response.output_parsed;
}
