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
import {
  runGenerateEvidenceId,
  runGenerateImpactId,
  runInspectId,
} from './commands/id.js';
import {
  runIssueReplay,
  runIssueReextract,
} from './commands/issue.js';
import { runList } from './commands/list.js';
import { runManifest } from './commands/manifest.js';
import { runPagesIndex } from './commands/pagesIndex.js';
import { runShowIssue } from './commands/show.js';
import { runValidate } from './commands/validate.js';
import type { ValidationScope } from './validators/index.js';

const program = new Command();
const collectRepeatedValues = (val: string, prev: string[] | undefined) =>
  (prev ?? []).concat(val);

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
    collectRepeatedValues,
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
  .command('pages-index')
  .description(
    'Generate index.html for GitHub Pages (static data landing page)',
  )
  .action(() => {
    const dataDir = program.opts().dataDir;
    const code = runPagesIndex({
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
const issue = program.command('issue').description('Issue maintenance tooling');
const id = program.command('id').description('Generate or inspect helper IDs');

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

issue
  .command('replay')
  .description('Replay issue impact events from existing evidence/impact data')
  .option(
    '--issue <issue-id>',
    'Replay only this issue (repeatable)',
    collectRepeatedValues,
  )
  .option('--dry-run', 'Compute replay results without writing')
  .action((opts) => {
    const dataDir = program.opts().dataDir;
    const code = runIssueReplay({
      dataDir,
    }, {
      issueIds: opts.issue,
      dryRun: opts.dryRun,
    });
    process.exit(code);
  });

issue
  .command('reextract')
  .description('Re-extract claims for targeted issue evidence, then replay')
  .option(
    '--mode <mode>',
    'Targeting mode: period-violations, degraded-future-no-service, empty-impact',
    'period-violations',
  )
  .option(
    '--issue <issue-id>',
    'Limit to this issue (repeatable)',
    collectRepeatedValues,
  )
  .option(
    '--evidence <evidence-id>',
    'Limit to this evidence item (repeatable)',
    collectRepeatedValues,
  )
  .option('--dry-run', 'List targeted evidence without re-extracting')
  .action(async (opts) => {
    const dataDir = program.opts().dataDir;
    const code = await runIssueReextract(
      { dataDir },
      {
        mode: opts.mode,
        issueIds: opts.issue,
        evidenceIds: opts.evidence,
        dryRun: opts.dryRun,
      },
    );
    process.exit(code);
  });

id
  .command('evidence')
  .description('Generate an evidence ID')
  .option('--ts <iso>', 'Anchor the ID to a specific ISO-8601 timestamp')
  .option('--json', 'Output JSON metadata instead of the raw ID')
  .action((opts) => {
    const code = runGenerateEvidenceId({
      ts: opts.ts,
      json: opts.json,
    });
    process.exit(code);
  });

id
  .command('impact')
  .description('Generate an impact-event ID')
  .option('--ts <iso>', 'Anchor the ID to a specific ISO-8601 timestamp')
  .option('--json', 'Output JSON metadata instead of the raw ID')
  .action((opts) => {
    const code = runGenerateImpactId({
      ts: opts.ts,
      json: opts.json,
    });
    process.exit(code);
  });

id
  .command('inspect')
  .description('Inspect a generated evidence / impact-event ID')
  .argument('<id>', 'Generated ID to inspect')
  .option('--json', 'Output JSON')
  .action((value, opts) => {
    const code = runInspectId(value, {
      json: opts.json,
    });
    process.exit(code);
  });

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
