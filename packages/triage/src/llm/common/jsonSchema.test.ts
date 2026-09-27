import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toOpenAiJsonSchema } from './jsonSchema.js';

function findSchemaKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => findSchemaKey(item, key));
  }

  if (value == null || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(
    ([entryKey, entryValue]) =>
      entryKey === key || findSchemaKey(entryValue, key),
  );
}

describe('toOpenAiJsonSchema', () => {
  it('omits duration patterns while preserving other string constraints', () => {
    const schema = z.object({
      durations: z.array(z.iso.duration().nullable()),
      timestamp: z.iso.datetime({ offset: true }),
      identifier: z.string().regex(/^[a-z]+$/),
    });
    const original = z.toJSONSchema(schema);
    const jsonSchema = toOpenAiJsonSchema(schema);

    expect(jsonSchema).toEqual({
      ...original,
      properties: {
        ...original.properties,
        durations: {
          type: 'array',
          items: {
            anyOf: [{ type: 'string', format: 'duration' }, { type: 'null' }],
          },
        },
      },
    });
    expect(findSchemaKey(original.properties?.durations, 'pattern')).toBe(true);
  });

  it('rewrites Zod discriminated-union oneOf entries to anyOf', () => {
    const schema = z.object({
      result: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('existing'), id: z.string() }),
        z.object({ kind: z.literal('new'), type: z.string() }),
      ]),
    });

    const jsonSchema = toOpenAiJsonSchema(schema);

    expect(findSchemaKey(jsonSchema, 'oneOf')).toBe(false);
    expect(findSchemaKey(jsonSchema, 'anyOf')).toBe(true);
  });
});
