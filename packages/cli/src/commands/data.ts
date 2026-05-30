import {
  listEntityIds,
  listIssueIds,
  readEntity,
  readIssueBundle,
  type ValidationScope,
  validateDataRoot,
} from '@mrtdown/fs';
import { parseCollection, parseValidationScope, readOption } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';

export async function runValidate(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const scopes: ValidationScope[] = [];
  for (
    let scope = readOption(args, '--scope');
    scope;
    scope = readOption(args, '--scope')
  ) {
    scopes.push(parseValidationScope(scope));
  }

  const result = await validateDataRoot(
    globals.dataDir,
    scopes.length > 0 ? scopes : undefined,
  );

  if (result.ok) {
    io.stdout(JSON.stringify(result.checked, null, 2));
    return 0;
  }

  io.stderr(result.errors.join('\n'));
  return 1;
}

export async function runList(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const collection = parseCollection(args.shift() ?? '');
  const ids =
    collection === 'issue'
      ? await listIssueIds(globals.dataDir)
      : await listEntityIds(globals.dataDir, collection);
  io.stdout(ids.join('\n'));
  return 0;
}

export async function runShow(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const collection = parseCollection(args.shift() ?? '');
  const id = args.shift();
  if (!id) {
    throw new Error('show requires an id');
  }

  const value =
    collection === 'issue'
      ? await readIssueBundle(globals.dataDir, id)
      : await readEntity(globals.dataDir, collection, id);
  io.stdout(JSON.stringify(value, null, 2));
  return 0;
}
