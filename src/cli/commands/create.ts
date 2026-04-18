import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { IssueType } from '#schema/issue/issueType.js';
import { IssueTypeSchema } from '#schema/issue/issueType.js';
import { FileWriteStore } from '#write/common/FileWriteStore.js';
import { MRTDownWriter } from '#write/MRTDownWriter.js';

type CreateOptions = {
  dataDir: string;
  dryRun?: boolean;
  stdin?: boolean;
};

function translationsFromEn(en: string) {
  return {
    'en-SG': en,
    'zh-Hans': null,
    ms: null,
    ta: null,
  };
}

export async function runCreateIssue(
  opts: CreateOptions,
  args: {
    date?: string;
    slug?: string;
    title?: string;
    type?: string;
    source?: string;
  },
): Promise<number> {
  const { date, slug, title, type, source } = args;
  if (!date || !slug || !title) {
    console.error(
      'Usage: create issue --date YYYY-MM-DD --slug <slug> --title <title> [--type disruption|maintenance|infra] [--source <source>]',
    );
    return 1;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!dateMatch) {
    console.error('Invalid date format. Use YYYY-MM-DD.');
    return 1;
  }

  const issueId = `${date}-${slug}`;
  const issueType = (
    type && IssueTypeSchema.safeParse(type).success ? type : 'disruption'
  ) as IssueType;

  const issue = {
    id: issueId,
    type: issueType,
    title: translationsFromEn(title),
    titleMeta: { source: source ?? 'cli' },
  };

  if (opts.dryRun) {
    console.log('Would create:', JSON.stringify(issue, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.issues.create(issue);
  console.log(
    `Created issue: ${join(opts.dataDir, 'issue', dateMatch[1], dateMatch[2], issueId)}`,
  );
  return 0;
}

export async function runCreateTown(
  opts: CreateOptions,
  args: { id?: string; name?: string },
): Promise<number> {
  if (!args.id || !args.name) {
    console.error('Usage: create town --id <id> --name <name>');
    return 1;
  }

  const town = {
    id: args.id,
    name: translationsFromEn(args.name),
  };

  if (opts.dryRun) {
    console.log('Would create:', JSON.stringify(town, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.towns.create(town);
  console.log(`Created town: ${join(opts.dataDir, 'town', `${town.id}.json`)}`);
  return 0;
}

export async function runCreateLandmark(
  opts: CreateOptions,
  args: { id?: string; name?: string },
): Promise<number> {
  if (!args.id || !args.name) {
    console.error('Usage: create landmark --id <id> --name <name>');
    return 1;
  }

  const landmark = {
    id: args.id,
    name: translationsFromEn(args.name),
  };

  if (opts.dryRun) {
    console.log('Would create:', JSON.stringify(landmark, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.landmarks.create(landmark);
  console.log(
    `Created landmark: ${join(opts.dataDir, 'landmark', `${landmark.id}.json`)}`,
  );
  return 0;
}

export async function runCreateOperator(
  opts: CreateOptions,
  args: { id?: string; name?: string; foundedAt?: string; url?: string },
): Promise<number> {
  if (!args.id || !args.name || !args.foundedAt) {
    console.error(
      'Usage: create operator --id <id> --name <name> --founded-at YYYY-MM-DD [--url <url>]',
    );
    return 1;
  }

  const operator = {
    id: args.id,
    name: translationsFromEn(args.name),
    foundedAt: args.foundedAt,
    url: args.url ?? null,
  };

  if (opts.dryRun) {
    console.log('Would create:', JSON.stringify(operator, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.operators.create(operator);
  console.log(
    `Created operator: ${join(opts.dataDir, 'operator', `${operator.id}.json`)}`,
  );
  return 0;
}

async function readStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  const chunks: string[] = [];
  for await (const line of rl) {
    chunks.push(line);
  }
  return chunks.join('\n');
}

export async function runCreateStation(
  opts: CreateOptions,
  args: Record<string, string | undefined>,
): Promise<number> {
  let json: unknown;
  if (opts.stdin) {
    const raw = await readStdin();
    json = JSON.parse(raw);
  } else {
    const file = args.stdinFile ?? args.file;
    if (file) {
      const raw = await readFile(file, 'utf-8');
      json = JSON.parse(raw);
    } else {
      console.error(
        'Usage: create station --stdin < JSON | create station --file <path>',
      );
      return 1;
    }
  }

  if (opts.dryRun) {
    console.log('Would create station:', JSON.stringify(json, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.stations.create(json as Parameters<typeof writer.stations.create>[0]);
  return 0;
}

export async function runCreateLine(
  opts: CreateOptions,
  args: Record<string, string | undefined>,
): Promise<number> {
  let json: unknown;
  if (opts.stdin) {
    const raw = await readStdin();
    json = JSON.parse(raw);
  } else {
    const file = args.stdinFile ?? args.file;
    if (file) {
      const raw = await readFile(file, 'utf-8');
      json = JSON.parse(raw);
    } else {
      console.error(
        'Usage: create line --stdin < JSON | create line --file <path>',
      );
      return 1;
    }
  }

  if (opts.dryRun) {
    console.log('Would create line:', JSON.stringify(json, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.lines.create(json as Parameters<typeof writer.lines.create>[0]);
  return 0;
}

export async function runCreateService(
  opts: CreateOptions,
  args: Record<string, string | undefined>,
): Promise<number> {
  let json: unknown;
  if (opts.stdin) {
    const raw = await readStdin();
    json = JSON.parse(raw);
  } else {
    const file = args.stdinFile ?? args.file;
    if (file) {
      const raw = await readFile(file, 'utf-8');
      json = JSON.parse(raw);
    } else {
      console.error(
        'Usage: create service --stdin < JSON | create service --file <path>',
      );
      return 1;
    }
  }

  if (opts.dryRun) {
    console.log('Would create service:', JSON.stringify(json, null, 2));
    return 0;
  }

  const store = new FileWriteStore(opts.dataDir);
  const writer = new MRTDownWriter({ store });
  writer.services.create(json as Parameters<typeof writer.services.create>[0]);
  return 0;
}
