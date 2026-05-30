import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { IssueTypeSchema } from '@mrtdown/core';
import {
  buildIssueId,
  createIssueBundle,
  writeUnknownEntity,
} from '@mrtdown/fs';
import { parseCollection, readOption } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';

export async function runCreate(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const entity = args.shift();
  if (entity === 'issue') {
    const date = readOption(args, '--date', { required: true }) as string;
    const title = readOption(args, '--title', { required: true }) as string;
    const slug = readOption(args, '--slug');
    const source = readOption(args, '--source') ?? 'cli';
    const type = IssueTypeSchema.parse(
      readOption(args, '--type') ?? 'disruption',
    );
    const id = buildIssueId(date, slug ?? title);
    const bundle = await createIssueBundle(globals.dataDir, {
      id,
      title,
      titleSource: source,
      type,
    });
    io.stdout(bundle.path);
    return 0;
  }

  const collection = parseCollection(entity ?? '');
  if (collection === 'issue') {
    throw new Error('Issue records must be created with create issue');
  }
  const file = readOption(args, '--file', { required: true }) as string;
  const json: unknown = JSON.parse(
    await readFile(resolve(globals.cwd, file), 'utf8'),
  );
  io.stdout(await writeUnknownEntity(globals.dataDir, collection, json));
  return 0;
}

export async function runId(args: string[], io: CliIO): Promise<number> {
  const kind = args.shift();
  if (kind !== 'issue') {
    throw new Error('Only id issue is supported');
  }
  const date = readOption(args, '--date', { required: true }) as string;
  const title = readOption(args, '--title', { required: true }) as string;
  const slug = readOption(args, '--slug');
  io.stdout(buildIssueId(date, slug ?? title));
  return 0;
}
