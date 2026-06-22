import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GenerateContentConfig,
  GenerateContentResponse,
} from '@google/genai';
import { FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';
import { type ZodType, z } from 'zod';
import { assert } from '../../util/assert.js';
import type { ToolRegistry } from './tool.js';

type JsonObject = { [key: string]: unknown };

export function buildGeminiJsonConfig({
  systemPrompt,
  responseSchema,
  toolRegistry,
}: {
  systemPrompt: string;
  responseSchema: ZodType;
  toolRegistry?: ToolRegistry;
}): GenerateContentConfig {
  const toolDeclarations =
    toolRegistry == null ? [] : toGeminiToolDeclarations(toolRegistry);

  return {
    systemInstruction: systemPrompt,
    responseMimeType: 'application/json',
    responseJsonSchema: toGeminiJsonSchema(responseSchema),
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.LOW,
    },
    tools:
      toolDeclarations.length > 0
        ? [{ functionDeclarations: toolDeclarations }]
        : undefined,
    toolConfig:
      toolDeclarations.length > 0
        ? {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          }
        : undefined,
  };
}

export function parseGeminiJsonResponse<T>(
  response: GenerateContentResponse,
  schema: ZodType<T>,
): T {
  const text = response.text;
  assert(text != null && text.trim() !== '', 'Gemini response text is empty');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Gemini response text is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return schema.parse(parsedJson);
}

export function toGeminiJsonSchema(schema: ZodType): JsonObject {
  return replaceOneOfWithAnyOf(z.toJSONSchema(schema)) as JsonObject;
}

export function getGeminiFunctionCalls(
  response: GenerateContentResponse,
): FunctionCall[] {
  return response.functionCalls ?? [];
}

export function getGeminiModelContent(
  response: GenerateContentResponse,
): Content | null {
  return response.candidates?.[0]?.content ?? null;
}

export function toGeminiFunctionResponseContent({
  functionCall,
  output,
}: {
  functionCall: FunctionCall;
  output: string;
}): Content {
  assert(
    functionCall.name != null && functionCall.name.trim() !== '',
    'Gemini function call name is missing',
  );

  return {
    role: 'user',
    parts: [
      {
        functionResponse: {
          id: functionCall.id,
          name: functionCall.name,
          response: { output },
        },
      },
    ],
  };
}

function toGeminiToolDeclarations(
  toolRegistry: ToolRegistry,
): FunctionDeclaration[] {
  return Object.values(toolRegistry).map((tool) => {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.paramsSchema,
    };
  });
}

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
