import { z } from 'zod';

type JsonObject = { [key: string]: unknown };

const UNSUPPORTED_REGEX_LOOKAROUND = /\(\?(?:[=!]|<[=!])/;

function normalizeForOpenAi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForOpenAi);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    // OpenAI strict JSON schemas reject regex lookaround. Preserve all other
    // patterns and companion constraints such as the JSON Schema format.
    if (
      key === 'pattern' &&
      typeof child === 'string' &&
      UNSUPPORTED_REGEX_LOOKAROUND.test(child)
    ) {
      continue;
    }

    output[key === 'oneOf' ? 'anyOf' : key] = normalizeForOpenAi(child);
  }
  return output;
}

export function toOpenAiJsonSchema(schema: z.ZodType): JsonObject {
  return normalizeForOpenAi(z.toJSONSchema(schema)) as JsonObject;
}
