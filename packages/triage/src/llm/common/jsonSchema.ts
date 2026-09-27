import { z } from 'zod';

type JsonObject = { [key: string]: unknown };

function normalizeOpenAiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeOpenAiSchema);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    // Zod's ISO duration regex uses lookaheads. Sending it to structured
    // outputs can produce an immediate max_output_tokens response with no
    // output or usage. Keep the duration format; validate with Zod locally.
    if (key === 'pattern' && 'format' in value && value.format === 'duration') {
      continue;
    }
    output[key === 'oneOf' ? 'anyOf' : key] = normalizeOpenAiSchema(child);
  }
  return output;
}

export function toOpenAiJsonSchema(schema: z.ZodType): JsonObject {
  return normalizeOpenAiSchema(z.toJSONSchema(schema)) as JsonObject;
}
