import { z } from 'zod';
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
import { GEMINI_FAST_MODEL } from '../../models.js';
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
  const model = GEMINI_FAST_MODEL;
  const usageTracker = new GeminiUsageTracker();

  const response = await getGeminiClient().models.generateContent({
    model,
    contents: `
Text: ${params.text}
`.trim(),
    config: buildGeminiJsonConfig({
      systemPrompt,
      responseSchema: ResponseSchema,
    }),
  });

  usageTracker.add(normalizeGeminiUsage(response.usageMetadata));
  logGeminiUsageSummary({
    label: 'generateIssueTitleAndSlug',
    summary: usageTracker.summary(),
  });

  return parseGeminiJsonResponse(response, ResponseSchema);
}
