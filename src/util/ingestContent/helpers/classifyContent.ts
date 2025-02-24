import { z } from 'zod';
import { openAiClient } from '../constants';
import type { IngestContent } from '../types';
import zodToJsonSchema from 'zod-to-json-schema';
import { ClassifyTypeSchema } from '../schema/ClassifyType';

export const ClassifyResultSchema = z.object({
  type: ClassifyTypeSchema,
  reason: z
    .string()
    .describe('Explain succinctly why the classification was chosen'),
});
export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;
export const ClassifyResultJsonSchema = zodToJsonSchema(ClassifyResultSchema);

export async function classifyContent(
  content: IngestContent,
): Promise<ClassifyResult> {
  const response = await openAiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `
Your role is to classify this post based on its relation to the Singapore MRT system.
Follow these rules:
- news should be classified under outage/maintenance/delay if it reports on any faults/disruption/maintenance.
- announcements of:
  - suspensions = maintenance
  - extended hours = irrelevant
  - delay = delay
  - resumption of services = probably either an outage, maintenance or delay
  - services being available = probably related to an outage or delay
  - repair works = probably outage
  - facility issues (e.g. lift problems) = infrastructure
  - alternative routes = irrelevant
`.trim(),
      },
      {
        role: 'user',
        content: JSON.stringify(content),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'ClassifyResult',
        strict: true,
        schema: ClassifyResultJsonSchema,
      },
    },
  });

  const classifyResult = ClassifyResultSchema.parse(
    JSON.parse(response.choices[0].message.content ?? ''),
  );
  return classifyResult;
}
