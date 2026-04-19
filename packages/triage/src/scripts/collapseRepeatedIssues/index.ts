/**
 * One-off tooling: cluster maintenance/infra issues by same slug + type +
 * overlapping/adjacent time ranges, optionally merge into canonical folders.
 *
 * Usage:
 *   node dist/scripts/collapseRepeatedIssues/index.js report [--out <path>]
 *   node dist/scripts/collapseRepeatedIssues/index.js merge --dry-run
 *   node dist/scripts/collapseRepeatedIssues/index.js merge --apply
 *
 * Options:
 *   --data-dir <path>   Repo `data` directory (default: ../../../../../data from this file)
 *   --adjacency-ms <n>  Max gap between ranges to count as adjacent (default: 86400000)
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Evidence, ImpactEvent, IssueBundle } from '@mrtdown/core';
import { FileStore, FileWriteStore, MRTDownRepository } from '@mrtdown/fs';
import { NdJson } from 'json-nd';
import {
  type CollapseCluster,
  clusterBySlugTypeAndTime,
  DEFAULT_ADJACENCY_MS,
  extractTimeRange,
  type IssueTimeRange,
} from './clusterMaintenanceInfra.js';

/** From .../packages/triage/src/scripts/collapseRepeatedIssues → repo root */
const REPO_ROOT = resolve(import.meta.dirname, '../../../../../');
const DEFAULT_DATA_DIR = join(REPO_ROOT, 'data');

function parseArgs(argv: string[]) {
  let dataDir = DEFAULT_DATA_DIR;
  let adjacencyMs = DEFAULT_ADJACENCY_MS;
  let mode: 'report' | 'merge' | null = null;
  let mergeDryRun = false;
  let mergeApply = false;
  let outPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir') {
      dataDir = resolve(argv[++i] ?? '');
      continue;
    }
    if (a === '--adjacency-ms') {
      adjacencyMs = Number(argv[++i]);
      if (!Number.isFinite(adjacencyMs) || adjacencyMs < 0) {
        throw new Error('Invalid --adjacency-ms');
      }
      continue;
    }
    if (a === '--out') {
      outPath = argv[++i] ?? null;
      continue;
    }
    if (a === '--dry-run') {
      mergeDryRun = true;
      continue;
    }
    if (a === '--apply') {
      mergeApply = true;
      continue;
    }
    if (a === 'report' || a === 'merge') {
      mode = a;
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }

  if (mode == null) {
    throw new Error('Expected command: report | merge');
  }
  if (mode === 'merge' && mergeDryRun === mergeApply) {
    throw new Error('merge requires exactly one of --dry-run | --apply');
  }

  return { dataDir, adjacencyMs, mode, mergeDryRun, mergeApply, outPath };
}

function assertNoDisruptionInClusters(clusters: CollapseCluster[]): void {
  for (const c of clusters) {
    if (c.type === 'disruption') {
      throw new Error(
        `Internal error: cluster ${c.clusterId} has disruption type`,
      );
    }
  }
}

function collectMaintenanceInfraRanges(
  repo: MRTDownRepository,
): IssueTimeRange[] {
  const ranges: IssueTimeRange[] = [];
  for (const issueId of repo.issues.listIds()) {
    const bundle = repo.issues.get(issueId);
    if (bundle == null) {
      continue;
    }
    const t = bundle.issue.type;
    if (t !== 'maintenance' && t !== 'infra') {
      continue;
    }
    const r = extractTimeRange(bundle);
    if (r == null) {
      continue;
    }
    ranges.push(r);
  }
  return ranges;
}

function sortEvidence(ev: Evidence[]): Evidence[] {
  return [...ev].sort((a, b) => {
    const c = a.ts.localeCompare(b.ts);
    return c !== 0 ? c : a.id.localeCompare(b.id);
  });
}

function sortImpact(ev: ImpactEvent[]): ImpactEvent[] {
  return [...ev].sort((a, b) => {
    const c = a.ts.localeCompare(b.ts);
    return c !== 0 ? c : a.id.localeCompare(b.id);
  });
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue;
    }
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function mergeBundles(
  members: IssueBundle[],
  canonicalId: string,
): IssueBundle {
  const canonical = members.find((b) => b.issue.id === canonicalId);
  if (canonical == null) {
    throw new Error(`Canonical bundle not found: ${canonicalId}`);
  }

  const allEvidence: Evidence[] = [];
  const allImpact: ImpactEvent[] = [];
  for (const b of members) {
    allEvidence.push(...b.evidence);
    allImpact.push(...b.impactEvents);
  }

  return {
    issue: canonical.issue,
    evidence: dedupeById(sortEvidence(allEvidence)),
    impactEvents: dedupeById(sortImpact(allImpact)),
    path: canonical.path,
  };
}

function writeBundleToDisk(
  writeStore: FileWriteStore,
  bundle: IssueBundle,
  issueRelPath: string,
): void {
  writeStore.writeJson(join(issueRelPath, 'issue.json'), bundle.issue);
  const evText =
    bundle.evidence.length > 0
      ? `${bundle.evidence.map((e) => NdJson.stringify([e])).join('\n')}\n`
      : '';
  const imText =
    bundle.impactEvents.length > 0
      ? `${bundle.impactEvents.map((e) => NdJson.stringify([e])).join('\n')}\n`
      : '';
  writeStore.writeText(join(issueRelPath, 'evidence.ndjson'), evText);
  writeStore.writeText(join(issueRelPath, 'impact.ndjson'), imText);
}

function runReport(opts: {
  dataDir: string;
  adjacencyMs: number;
  outPath: string | null;
}): void {
  const store = new FileStore(opts.dataDir);
  const repo = new MRTDownRepository({ store });
  const ranges = collectMaintenanceInfraRanges(repo);
  const clusters = clusterBySlugTypeAndTime(ranges, opts.adjacencyMs);
  assertNoDisruptionInClusters(clusters);

  const payload = {
    generatedAt: new Date().toISOString(),
    dataDir: opts.dataDir,
    adjacencyMs: opts.adjacencyMs,
    clusterCount: clusters.length,
    clusters: clusters.map((c) => ({
      clusterId: c.clusterId,
      normalizedSlug: c.normalizedSlug,
      type: c.type,
      canonicalIssueId: c.canonicalIssueId,
      memberIssueIds: c.members.map((m) => m.issueId),
      memberRanges: c.members.map((m) => ({
        issueId: m.issueId,
        startMs: m.startMs,
        endMs: m.endMs,
        source: m.source,
      })),
      timeOverlapEvidence: c.adjacencyEvidence,
    })),
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (opts.outPath) {
    const abs = resolve(opts.outPath);
    mkdirSync(resolve(abs, '..'), { recursive: true });
    writeFileSync(abs, json, 'utf8');
    console.log(`Wrote ${abs}`);
  } else {
    process.stdout.write(json);
  }
}

function repoRootFromDataDir(dataDir: string): string {
  return resolve(dataDir, '..');
}

function loadJsonArray(path: string): string[] {
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function runMerge(opts: {
  dataDir: string;
  adjacencyMs: number;
  dryRun: boolean;
}): void {
  const store = new FileStore(opts.dataDir);
  const repo = new MRTDownRepository({ store });
  const writeStore = new FileWriteStore(opts.dataDir);

  const ranges = collectMaintenanceInfraRanges(repo);
  const clusters = clusterBySlugTypeAndTime(ranges, opts.adjacencyMs);
  assertNoDisruptionInClusters(clusters);

  const root = repoRootFromDataDir(opts.dataDir);
  const migratedPath = join(root, 'migrated-legacy-ids.json');
  const mappingPath = join(root, 'issue-collapse-mapping.json');

  const mappingEntries: {
    canonicalIssueId: string;
    mergedIssueIds: string[];
  }[] = [];

  let mergedAwayCount = 0;

  for (const c of clusters) {
    const memberIds = c.members.map((m) => m.issueId);
    const bundles: IssueBundle[] = [];
    for (const id of memberIds) {
      const b = repo.issues.get(id);
      if (b == null) {
        throw new Error(`Missing bundle for ${id}`);
      }
      if (b.issue.type === 'disruption') {
        throw new Error(`Refusing merge: ${id} is disruption`);
      }
      bundles.push(b);
    }

    const merged = mergeBundles(bundles, c.canonicalIssueId);
    const canonicalPath = repo.issues.getPath(c.canonicalIssueId);
    if (canonicalPath == null) {
      throw new Error(`No path for canonical ${c.canonicalIssueId}`);
    }

    const toRemove = memberIds.filter((id) => id !== c.canonicalIssueId);
    mappingEntries.push({
      canonicalIssueId: c.canonicalIssueId,
      mergedIssueIds: toRemove,
    });

    if (opts.dryRun) {
      console.log(
        `[dry-run] ${c.clusterId}\n  canonical: ${c.canonicalIssueId}\n  remove: ${toRemove.join(', ')}\n  evidence: ${merged.evidence.length} impact: ${merged.impactEvents.length}\n`,
      );
      mergedAwayCount += toRemove.length;
      continue;
    }

    writeBundleToDisk(writeStore, merged, canonicalPath);

    for (const id of toRemove) {
      const p = repo.issues.getPath(id);
      if (p == null) {
        continue;
      }
      const abs = join(opts.dataDir, p);
      rmSync(abs, { recursive: true, force: true });
      console.log(`Removed ${abs}`);
    }
    mergedAwayCount += toRemove.length;
  }

  if (opts.dryRun) {
    console.log(
      `\nDry-run complete: ${clusters.length} cluster(s), ${mergedAwayCount} issue dir(s) would be removed.`,
    );
    return;
  }

  const existingMigrated = loadJsonArray(migratedPath);
  const newLegacy = mappingEntries.flatMap((e) => e.mergedIssueIds);
  const mergedMigrated = [
    ...new Set([...existingMigrated, ...newLegacy]),
  ].sort();
  writeFileSync(
    migratedPath,
    `${JSON.stringify(mergedMigrated, null, 2)}\n`,
    'utf8',
  );
  console.log(`Updated ${migratedPath} (+${newLegacy.length} id(s))`);

  let existingMapping: {
    canonicalIssueId: string;
    mergedIssueIds: string[];
  }[] = [];
  try {
    const raw = readFileSync(mappingPath, 'utf8').trim();
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        existingMapping = parsed as typeof existingMapping;
      }
    }
  } catch {
    // ignore
  }
  const combinedMapping = [...existingMapping, ...mappingEntries];
  writeFileSync(
    mappingPath,
    `${JSON.stringify(combinedMapping, null, 2)}\n`,
    'utf8',
  );
  console.log(`Updated ${mappingPath}`);

  console.log(
    `\nMerge complete: ${clusters.length} cluster(s), ${mergedAwayCount} issue dir(s) removed.`,
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'report') {
    runReport({
      dataDir: args.dataDir,
      adjacencyMs: args.adjacencyMs,
      outPath: args.outPath,
    });
    return;
  }
  runMerge({
    dataDir: args.dataDir,
    adjacencyMs: args.adjacencyMs,
    dryRun: args.mergeDryRun,
  });
}

main();
