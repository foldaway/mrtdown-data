import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const entrypoint = resolve(import.meta.dirname, '../dist/index.js');
const shebang = '#!/usr/bin/env node\n';
const text = await readFile(entrypoint, 'utf8');

if (!text.startsWith(shebang)) {
  await writeFile(entrypoint, shebang + text.replace(/^#!.*\n/, ''));
}

await chmod(entrypoint, 0o755);
