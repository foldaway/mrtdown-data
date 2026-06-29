import { resolve } from 'node:path';
import {
  type EntityCollection,
  entityCollections,
  type ValidationScope,
} from '@mrtdown/fs';
import type { ParsedArgs } from './types.js';

export function parseArgs(argv: readonly string[], cwd: string): ParsedArgs {
  const command = [...argv];
  let dataDir = resolve(cwd, 'data');

  for (let index = 0; index < command.length; index += 1) {
    const arg = command[index];
    if (arg !== '--data-dir' && arg !== '-d') {
      continue;
    }

    const value = command[index + 1];
    if (!value) {
      throw new Error('--data-dir requires a value');
    }
    dataDir = resolve(cwd, value);
    command.splice(index, 2);
    index -= 1;
  }

  return {
    globals: {
      cwd,
      dataDir,
    },
    command,
  };
}

export function readOption(
  args: string[],
  name: string,
  options: { required?: boolean } = {},
): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    if (options.required) {
      throw new Error(`${name} is required`);
    }
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }

  args.splice(index, 2);
  return value;
}

export function hasFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

export function parseCollection(value: string): EntityCollection | 'issue' {
  if (
    value === 'issue' ||
    entityCollections.includes(value as EntityCollection)
  ) {
    return value as EntityCollection | 'issue';
  }
  throw new Error(`Unknown collection: ${value}`);
}

export function parseValidationScope(value: string): ValidationScope {
  if (value === 'rights' || value === 'schematic-map') {
    return value;
  }
  return parseCollection(value);
}
