#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IssueTypeSchema,
  SchematicMapEffectiveDateSchema,
  SchematicMapLayoutEngineIdSchema,
} from '@mrtdown/core';
import {
  buildIssueId,
  buildManifest,
  createIssueBundle,
  type EntityCollection,
  entityCollections,
  listEntityIds,
  listIssueIds,
  listSchematicMapConstraintSetEffectiveDates,
  listSchematicMapVersionSnapshotEffectiveDates,
  readEntity,
  readIssueBundle,
  readSchematicMapConstraintSet,
  readSchematicMapManifest,
  readSchematicMapRuleSet,
  readSchematicMapVersionSnapshot,
  renderPagesIndex,
  type ValidationScope,
  validateDataRoot,
  writeUnknownEntity,
} from '@mrtdown/fs';

export type CliIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const defaultIo: CliIO = {
  stdout: (text) => console.log(text),
  stderr: (text) => console.error(text),
};

type GlobalOptions = {
  cwd: string;
  dataDir: string;
};

type ParsedArgs = {
  globals: GlobalOptions;
  command: string[];
};

const usage = `Usage:
  mrtdown [--data-dir <path>] validate [--scope <scope>]
  mrtdown [--data-dir <path>] list <station|line|service|operator|town|landmark|issue>
  mrtdown [--data-dir <path>] show <station|line|service|operator|town|landmark|issue> <id>
  mrtdown [--data-dir <path>] schematic-map list <constraint|version>
  mrtdown [--data-dir <path>] schematic-map show <manifest|rules|constraint|version> [id]
  mrtdown [--data-dir <path>] create issue --date <YYYY-MM-DD> --title <title> [--slug <slug>] [--type <type>] [--source <source>]
  mrtdown [--data-dir <path>] create <station|line|service|operator|town|landmark> --file <path>
  mrtdown id issue --date <YYYY-MM-DD> --title <title>
  mrtdown [--data-dir <path>] manifest [--write]
  mrtdown [--data-dir <path>] pages-index [--write]
`;

function parseArgs(argv: readonly string[], cwd: string): ParsedArgs {
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

function readOption(
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

function hasFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function parseCollection(value: string): EntityCollection | 'issue' {
  if (
    value === 'issue' ||
    entityCollections.includes(value as EntityCollection)
  ) {
    return value as EntityCollection | 'issue';
  }
  throw new Error(`Unknown collection: ${value}`);
}

function parseValidationScope(value: string): ValidationScope {
  if (value === 'schematic-map') {
    return value;
  }
  return parseCollection(value);
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

async function runValidate(
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

async function runList(
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

async function runShow(
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

async function runSchematicMap(
  args: string[],
  globals: GlobalOptions,
  io: CliIO,
): Promise<number> {
  const action = args.shift();

  if (action === 'list') {
    const kind = args.shift();
    const values =
      kind === 'constraint'
        ? await listSchematicMapConstraintSetEffectiveDates(globals.dataDir)
        : kind === 'version'
          ? await listSchematicMapVersionSnapshotEffectiveDates(globals.dataDir)
          : undefined;

    if (!values) {
      throw new Error('schematic-map list requires constraint or version');
    }

    io.stdout(values.join('\n'));
    return 0;
  }

  if (action === 'show') {
    const kind = args.shift();
    const id = args.shift();
    const value =
      kind === 'manifest'
        ? await readSchematicMapManifest(globals.dataDir)
        : kind === 'rules'
          ? await readSchematicMapRuleSet(
              globals.dataDir,
              id ? SchematicMapLayoutEngineIdSchema.parse(id) : undefined,
            )
          : kind === 'constraint' && id
            ? await readSchematicMapConstraintSet(
                globals.dataDir,
                SchematicMapEffectiveDateSchema.parse(id),
              )
            : kind === 'version' && id
              ? await readSchematicMapVersionSnapshot(
                  globals.dataDir,
                  SchematicMapEffectiveDateSchema.parse(id),
                )
              : undefined;

    if (!value) {
      throw new Error(
        'schematic-map show requires manifest, rules, constraint <YYYY-MM>, or version <YYYY-MM>',
      );
    }

    io.stdout(JSON.stringify(value, null, 2));
    return 0;
  }

  throw new Error('schematic-map requires list or show');
}

async function runCreate(
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

async function runId(args: string[], io: CliIO): Promise<number> {
  const kind = args.shift();
  if (kind !== 'issue') {
    throw new Error('Only id issue is supported');
  }
  const date = readOption(args, '--date', { required: true }) as string;
  const title = readOption(args, '--title', { required: true }) as string;
  io.stdout(buildIssueId(date, title));
  return 0;
}

async function runManifest(
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

async function runPagesIndex(
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
