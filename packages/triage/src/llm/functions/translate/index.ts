import { TranslationsSchema } from '@mrtdown/core';
import type { ResponseInputItem } from 'openai/resources/responses/responses.js';
import {
  logOpenAIUsageCostSummary,
  normalizeOpenAIResponsesUsage,
  OpenAIUsageCostTracker,
} from '../../../helpers/estimateOpenAICost.js';
import { assert } from '../../../util/assert.js';
import { getOpenAiClient, runOpenAIRequestWithRetry } from '../../client.js';
import { toOpenAiJsonSchema } from '../../common/jsonSchema.js';
import { TRANSLATE_MODEL } from './model.js';

export async function translate(text: string) {
  const model = TRANSLATE_MODEL;
  const usageCostTracker = new OpenAIUsageCostTracker();

  const context: ResponseInputItem[] = [{ role: 'user', content: text }];

  const response = await runOpenAIRequestWithRetry(
    () =>
      getOpenAiClient().responses.parse({
        model,
        input: context,
        instructions:
          `You are a helpful assistant that translates text to the following languages:
- English
- Chinese (Simplified)
- Malay
- Tamil

These translations relate to transit disruption/maintenance/infrastructure issues and can contain names of lines and/or stations.
Line names, station names, service IDs, station codes, operator names, road names, and bus stop IDs are proper nouns.
Copy those proper nouns exactly as written in the source text into every locale.
Do not translate, transliterate, localize, shorten, or abbreviate those proper nouns.
`.trim(),
        text: {
          format: {
            type: 'json_schema',
            name: 'Translation',
            strict: true,
            schema: toOpenAiJsonSchema(TranslationsSchema),
          },
        },
        reasoning: {
          effort: 'low',
          summary: 'concise',
        },
        store: false,
        include: ['reasoning.encrypted_content'],
      }),
    {
      label: 'translate',
    },
  );

  const usage = normalizeOpenAIResponsesUsage(response.usage);
  usageCostTracker.add({ model, usage });
  logOpenAIUsageCostSummary({
    label: 'translate',
    summary: usageCostTracker.summary(),
  });

  const parsed = response.output_parsed;
  assert(parsed != null, 'Response output parsed is null');

  return parsed;
}
