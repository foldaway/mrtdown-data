import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildManifest, renderPagesIndex } from '@mrtdown/fs';
import { hasFlag } from '../args.js';
import type { CliIO, GlobalOptions } from '../types.js';

export async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

export async function runManifest(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const shouldWrite = hasFlag(args, '--write');
  const manifest = await buildManifest(globals.dataDir);
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (shouldWrite) {
    await writeTextFile(join(globals.dataDir, 'manifest.json'), json);
    io.stdout('manifest.json');
    return 0;
  }

  io.stdout(json.trimEnd());
  return 0;
}

export async function runPagesIndex(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const shouldWrite = hasFlag(args, '--write');
  const html = renderPagesIndex(await buildManifest(globals.dataDir));

  if (shouldWrite) {
    await writeTextFile(join(globals.dataDir, 'index.html'), html);
    io.stdout('index.html');
    return 0;
  }

  io.stdout(html.trimEnd());
  return 0;
}
