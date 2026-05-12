import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';

export async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await readFile(path, 'utf8');
  const json: unknown = JSON.parse(text);
  return schema.parse(json);
}

export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readNdjsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const text = await readFile(path, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => schema.parse(JSON.parse(line) as unknown));
}

export async function writeNdjsonFile(
  path: string,
  values: readonly unknown[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const text =
    values.map((value) => JSON.stringify(value)).join('\n') +
    (values.length > 0 ? '\n' : '');
  await writeFile(path, text);
}
