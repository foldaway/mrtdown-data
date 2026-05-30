#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { parseArgs } from './args.js';
import { runCreate, runId } from './commands/create.js';
import { runList, runShow, runValidate } from './commands/data.js';
import { runIssue } from './commands/issue.js';
import { runManifest, runPagesIndex } from './commands/manifest.js';
import { runSchematicMap } from './commands/schematicMap.js';
import type { CliIO } from './types.js';
import { usage } from './usage.js';

export type { CliIO } from './types.js';

const defaultIo: CliIO = {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
};

export async function runCli(
  argv: readonly string[],
  io: CliIO = defaultIo,
  cwd = process.cwd(),
): Promise<number> {
  try {
    const { command, globals } = parseArgs(argv, cwd);
    const verb = command.shift();

    switch (verb) {
      case 'validate':
        return await runValidate(command, globals, io);
      case 'list':
        return await runList(command, globals, io);
      case 'show':
        return await runShow(command, globals, io);
      case 'issue':
        return await runIssue(command, globals, io);
      case 'schematic-map':
        return await runSchematicMap(command, globals, io);
      case 'create':
        return await runCreate(command, globals, io);
      case 'id':
        return await runId(command, io);
      case 'manifest':
        return await runManifest(command, globals, io);
      case 'pages-index':
        return await runPagesIndex(command, globals, io);
      case '--help':
      case '-h':
      case undefined:
        io.stdout(usage.trimEnd());
        return 0;
      default:
        throw new Error(`Unknown command: ${verb}`);
    }
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2));
}
