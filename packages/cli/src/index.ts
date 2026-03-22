#!/usr/bin/env node

import 'dotenv/config';

import { join } from 'node:path';
import { Command } from 'commander';
import {
  runCreateIssue,
  runCreateLandmark,
  runCreateLine,
  runCreateOperator,
  runCreateService,
  runCreateStation,
  runCreateTown,
} from './commands/create.js';
import { runList } from './commands/list.js';
import { runManifest } from './commands/manifest.js';
import { runShowIssue } from './commands/show.js';
import { runValidate } from './commands/validate.js';
import type { ValidationScope } from './validators/index.js';

const program = new Command();

program
  .name('mrtdown-cli')
  .description(
    'CLI for mrtdown-data: create entities, validate data, and tooling',
  )
  .option(
    '-d, --data-dir <path>',
    'Data directory',
    join(process.cwd(), '../../data'),
  );

program
  .command('validate')
  .description('Validate all data files against schemas')
  .option(
    '--scope <scope>',
    'Only validate these entity types (repeatable): town, landmark, operator, station, line, service, issue',
    (val: string, prev: string[] | undefined) => (prev ?? []).concat(val),
  )
  .action((opts) => {
    const dataDir = program.opts().dataDir;
    const scope = opts.scope as string[] | undefined;
    const code = runValidate({
      dataDir,
      scope: scope?.length ? (scope as ValidationScope[]) : undefined,
    });
    process.exit(code);
  });

program
  .command('manifest')
  .description(
    'Generate a JSON manifest of all entities under the data directory',
  )
  .action(() => {
    const dataDir = program.opts().dataDir;
    const code = runManifest({
      dataDir,
    });
    process.exit(code);
  });

program
  .command('show')
  .description('Display the current state of an issue')
  .argument(
    '<issue-id>',
    'Issue ID (e.g. 2011-09-20-faulty-cable-led-to-circle-line-disruption)',
  )
  .option('--json', 'Output as JSON')
  .action((issueId, opts) => {
    const dataDir = program.opts().dataDir;
    const code = runShowIssue({
      dataDir,
      issueId,
      json: opts.json,
    });
    process.exit(code);
  });

const list = program.command('list').description('List entities');

const listEntities = [
  'issue',
  'town',
  'landmark',
  'operator',
  'station',
  'line',
  'service',
] as const;

for (const entity of listEntities) {
  list
    .command(entity)
    .description(`List ${entity}s`)
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const dataDir = program.opts().dataDir;
      const code = runList({
        dataDir,
        entity,
        json: opts.json,
      });
      process.exit(code);
    });
}

const create = program.command('create').description('Create a new entity');

create
  .command('issue')
  .description('Create a new issue')
  .requiredOption('--date <YYYY-MM-DD>', 'Issue date')
  .requiredOption('--slug <slug>', 'URL-safe slug for the issue')
  .requiredOption('--title <title>', 'English title')
  .option(
    '--type <type>',
    'Issue type: disruption, maintenance, infra',
    'disruption',
  )
  .option('--source <source>', 'Title source', 'cli')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateIssue(
      { dataDir, dryRun: opts.dryRun },
      {
        date: opts.date,
        slug: opts.slug,
        title: opts.title,
        type: opts.type,
        source: opts.source,
      },
    );
    process.exit(code);
  });

create
  .command('town')
  .description('Create a new town')
  .requiredOption('--id <id>', 'Town ID (e.g. yishun)')
  .requiredOption('--name <name>', 'English name')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateTown(
      { dataDir, dryRun: opts.dryRun },
      { id: opts.id, name: opts.name },
    );
    process.exit(code);
  });

create
  .command('landmark')
  .description('Create a new landmark')
  .requiredOption('--id <id>', 'Landmark ID (e.g. northpoint-city)')
  .requiredOption('--name <name>', 'English name')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateLandmark(
      { dataDir, dryRun: opts.dryRun },
      { id: opts.id, name: opts.name },
    );
    process.exit(code);
  });

create
  .command('operator')
  .description('Create a new operator')
  .requiredOption('--id <id>', 'Operator ID (e.g. SMRT_TRAINS)')
  .requiredOption('--name <name>', 'English name')
  .requiredOption('--founded-at <date>', 'Founded date (YYYY-MM-DD)')
  .option('--url <url>', 'Operator website URL')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateOperator(
      { dataDir, dryRun: opts.dryRun },
      {
        id: opts.id,
        name: opts.name,
        foundedAt: opts.foundedAt,
        url: opts.url,
      },
    );
    process.exit(code);
  });

create
  .command('station')
  .description('Create a station from JSON (--stdin or --file)')
  .option('--stdin', 'Read JSON from stdin')
  .option('--file <path>', 'Read JSON from file')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateStation(
      { dataDir, dryRun: opts.dryRun, stdin: opts.stdin },
      { file: opts.file },
    );
    process.exit(code);
  });

create
  .command('line')
  .description('Create a line from JSON (--stdin or --file)')
  .option('--stdin', 'Read JSON from stdin')
  .option('--file <path>', 'Read JSON from file')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateLine(
      { dataDir, dryRun: opts.dryRun, stdin: opts.stdin },
      { file: opts.file },
    );
    process.exit(code);
  });

create
  .command('service')
  .description('Create a service from JSON (--stdin or --file)')
  .option('--stdin', 'Read JSON from stdin')
  .option('--file <path>', 'Read JSON from file')
  .option('--dry-run', 'Print what would be created without writing')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runCreateService(
      { dataDir, dryRun: opts.dryRun, stdin: opts.stdin },
      { file: opts.file },
    );
    process.exit(code);
  });

program.parse();
