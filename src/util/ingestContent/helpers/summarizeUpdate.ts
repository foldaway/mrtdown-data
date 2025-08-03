import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import type { IngestContent } from '../types';
import { openAiClient } from '../constants';
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
Your role is to help ingest the given post into an incidents system that tracks the MRT and LRT in Singapore.
Please summarize the post.
  `.trim(),
    },
    {
      role: 'user',
      content: `The post: ${JSON.stringify(content)}`,
    },
  ];
  const response = await openAiClient.chat.completions.create({
    model: 'gpt-4o-mini',
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
