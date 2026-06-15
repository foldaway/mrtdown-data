import { z } from 'zod';

type JsonObject = { [key: string]: unknown };

function replaceOneOfWithAnyOf(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(replaceOneOfWithAnyOf);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    output[key === 'oneOf' ? 'anyOf' : key] = replaceOneOfWithAnyOf(child);
  }
  return output;
}

export function toOpenAiJsonSchema(schema: z.ZodType): JsonObject {
  return replaceOneOfWithAnyOf(z.toJSONSchema(schema)) as JsonObject;
}
