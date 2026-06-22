import { TranslationsSchema } from '@mrtdown/core';
import {
  GeminiUsageTracker,
  logGeminiUsageSummary,
  normalizeGeminiUsage,
} from '../../../helpers/geminiUsage.js';
import { getGeminiClient } from '../../client.js';
import {
  buildGeminiJsonConfig,
  parseGeminiJsonResponse,
} from '../../common/gemini.js';
import { TRANSLATE_MODEL } from './model.js';

export async function translate(text: string) {
  const model = TRANSLATE_MODEL;
  const usageTracker = new GeminiUsageTracker();

  const response = await getGeminiClient().models.generateContent({
    model,
    contents: text,
    config: buildGeminiJsonConfig({
      responseSchema: TranslationsSchema,
      systemPrompt:
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
    }),
  });

  usageTracker.add(normalizeGeminiUsage(response.usageMetadata));
  logGeminiUsageSummary({
    label: 'translate',
    summary: usageTracker.summary(),
  });

  return parseGeminiJsonResponse(response, TranslationsSchema);
}
