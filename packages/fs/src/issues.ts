import { access, mkdir, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  type Evidence,
  EvidenceSchema,
  type ImpactEvent,
  ImpactEventSchema,
  type Issue,
  type IssueBundle,
  IssueBundleSchema,
  IssueSchema,
  type IssueType,
  IssueTypeSchema,
} from '@mrtdown/core';
import {
  evidenceFileName,
  impactFileName,
  issueDirectory,
  issueFileName,
} from './constants.js';
import {
  readJsonFile,
  readNdjsonFile,
  writeJsonFile,
  writeNdjsonFile,
} from './json.js';
import { toDataPath } from './paths.js';

export type NewIssueInput = {
  id: string;
  type?: IssueType;
  title: string;
  titleSource?: string;
};

export function issuePathFromId(dataDir: string, id: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(id);
  if (!match) {
    throw new Error(
      `Invalid issue id: ${id} (expected format: YYYY-MM-DD-<slug>, e.g. 2024-01-15-circle-line-delay)`,
    );
  }
  const [, year, month] = match;
  return join(dataDir, issueDirectory, year, month, id);
}

export async function listIssueIds(dataDir: string): Promise<string[]> {
  const root = join(dataDir, issueDirectory);
  try {
    const years = await readdir(root, { withFileTypes: true });
    const ids: string[] = [];
    for (const year of years.filter((entry) => entry.isDirectory())) {
      const yearPath = join(root, year.name);
      const months = await readdir(yearPath, { withFileTypes: true });
      for (const month of months.filter((entry) => entry.isDirectory())) {
        const monthPath = join(yearPath, month.name);
        const issues = await readdir(monthPath, { withFileTypes: true });
        ids.push(
          ...issues
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name),
        );
      }
    }
    return ids.sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readIssueBundle(
  dataDir: string,
  id: string,
): Promise<IssueBundle> {
  const issueDir = issuePathFromId(dataDir, id);
  const bundle = {
    issue: await readJsonFile(join(issueDir, issueFileName), IssueSchema),
    evidence: await readNdjsonFile(
      join(issueDir, evidenceFileName),
      EvidenceSchema,
    ),
    impactEvents: await readNdjsonFile(
      join(issueDir, impactFileName),
      ImpactEventSchema,
    ),
    path: toDataPath(relative(dataDir, issueDir)),
  };
  return IssueBundleSchema.parse(bundle);
}

export async function listIssueBundles(
  dataDir: string,
): Promise<IssueBundle[]> {
  const ids = await listIssueIds(dataDir);
  return Promise.all(ids.map((id) => readIssueBundle(dataDir, id)));
}

export async function issueExists(
  dataDir: string,
  id: string,
): Promise<boolean> {
  try {
    await access(issuePathFromId(dataDir, id));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function buildIssue(input: NewIssueInput): Issue {
  return IssueSchema.parse({
    id: input.id,
    type: input.type ?? IssueTypeSchema.enum.disruption,
    title: {
      'en-SG': input.title,
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    titleMeta: {
      source: input.titleSource ?? 'cli',
    },
  });
}

export async function createIssueBundle(
  dataDir: string,
  input: NewIssueInput,
  evidence: readonly Evidence[] = [],
  impactEvents: readonly ImpactEvent[] = [],
): Promise<IssueBundle> {
  const issue = buildIssue(input);
  if (await issueExists(dataDir, issue.id)) {
    throw new Error(`Issue already exists: ${issue.id}`);
  }

  const issueDir = issuePathFromId(dataDir, issue.id);
  await mkdir(issueDir, { recursive: true });
  await writeJsonFile(join(issueDir, issueFileName), issue);
  await writeNdjsonFile(join(issueDir, evidenceFileName), evidence);
  await writeNdjsonFile(join(issueDir, impactFileName), impactEvents);
  return readIssueBundle(dataDir, issue.id);
}
