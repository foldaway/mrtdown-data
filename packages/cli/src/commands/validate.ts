import { FileStore } from '@mrtdown/fs';
import { type ValidationScope, validateAll } from '../validators/index.js';

export interface ValidateCliOptions {
  dataDir: string;
  scope?: ValidationScope[];
}

export function runValidate(opts: ValidateCliOptions): number {
  const store = new FileStore(opts.dataDir);
  const errors = validateAll(store, { scope: opts.scope });

  if (errors.length === 0) {
    console.log('All data files are valid.');
    return 0;
  }

  console.error(`\nFound ${errors.length} validation error(s):\n`);
  for (const err of errors) {
    const loc = err.line ? `${err.file}:${err.line}` : err.file;
    console.error(`  ${loc}`);
    console.error(`    ${err.message}`);
    console.error('');
  }
  return 1;
}
