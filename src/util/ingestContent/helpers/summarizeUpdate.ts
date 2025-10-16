import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import type { IngestContent } from '../types.js';
import { openAiClient } from '../constants.js';
import { z } from 'zod';

const PostSummaryResultSchema = z.object({
  summary: z.string(),
});
const PostSummaryResultJsonSchema = z.toJSONSchema(PostSummaryResultSchema);

export async function summarizeUpdate(content: IngestContent) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `
You are helping to process content for an MRT/LRT incident tracking system in Singapore. Your task is to create a concise, informative summary of the given post.

Guidelines:
- Focus on transportation-related information (disruptions, delays, maintenance, service updates)
- Include specific line names (NSL, EWL, CCL, DTL, TEL, etc.) and station names when mentioned
- Note any timing information (duration, affected periods)
- Mention impact severity (full closure, partial disruption, delays)
- Keep technical jargon minimal and use clear, factual language
- Summarize in 1-3 sentences maximum
- If the post is not MRT/LRT related, indicate this clearly

Return only the summary content without preamble or explanation.
  `.trim(),
    },
    {
      role: 'user',
      content: `The post: ${JSON.stringify(content)}`,
    },
  ];
  const response = await openAiClient.chat.completions.create({
    model: 'gpt-5-nano',
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'PostSummaryResult',
        strict: true,
        schema: PostSummaryResultJsonSchema,
      },
    },
  });

  const { message } = response.choices[0];
  messages.push(message);

  const { summary } = PostSummaryResultSchema.parse(
    JSON.parse(message.content ?? ''),
  );
  return summary;
}
