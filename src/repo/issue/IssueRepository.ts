import { join } from 'node:path';
import Fuse, { type Expression } from 'fuse.js';
import { NdJson } from 'json-nd';
import z from 'zod';
import type { IssueBundle } from '../../schema/issue/bundle.js';
import { EvidenceSchema } from '../../schema/issue/evidence.js';
import { ImpactEventSchema } from '../../schema/issue/impactEvent.js';
import { IssueSchema } from '../../schema/issue/issue.js';
import { DIR_ISSUE } from '../../constants.js';
import type { IStore } from '../common/store.js';

type IssueIndexEntry = {
  issueId: string;
  path: string; // e.g. data/issues/2026/01/01/<issueId>
  year: number;
  month: number;
};

export class IssueRepository {
  private readonly store: IStore;

  constructor(store: IStore) {
    this.store = store;
  }

  // Index for fast lookup by issue ID.
  private byId = new Map<string, IssueIndexEntry>();
  private indexed = false;

  // Cache for issue bundles.
  private bundleCache = new Map<string, IssueBundle>();

  /**
   * Build the index of all issues.
   */
  private buildIndex() {
    if (this.indexed) {
      return;
    }

    const years = this.store.listDir(DIR_ISSUE);
    for (const year of years) {
      if (!/^\d{4}$/.test(year)) {
        continue;
      }
      const months = this.store.listDir(join(DIR_ISSUE, year));
      for (const month of months) {
        if (!/^\d{2}$/.test(month)) {
          continue;
        }
        const issues = this.store.listDir(join(DIR_ISSUE, year, month));
        for (const issueId of issues) {
          this.byId.set(issueId, {
            issueId: issueId,
            path: join(DIR_ISSUE, year, month, issueId),
            year: Number(year),
            month: Number(month),
          });
        }
      }
    }
    this.indexed = true;
  }

  /**
   * Return the relative folder path to the issue.
   * @param id
   * @returns
   */
  getPath(id: string): string | null {
    this.buildIndex();
    return this.byId.get(id)?.path ?? null;
  }

  get(id: string): IssueBundle | null {
    this.buildIndex();

    const isCached = this.bundleCache.has(id);
    if (isCached) {
      return this.bundleCache.get(id) ?? null;
    }

    const entry = this.byId.get(id);
    if (!entry) {
      return null;
    }

    const issue = IssueSchema.parse(
      this.store.readJson(join(entry.path, 'issue.json')),
    );

    const evidencePath = join(entry.path, 'evidence.ndjson');
    const evidenceRaw = this.store.exists(evidencePath)
      ? this.store.readText(evidencePath).trim()
      : '';
    const evidence = z
      .array(EvidenceSchema)
      .parse(evidenceRaw ? NdJson.parse(evidenceRaw) : []);

    const impactPath = join(entry.path, 'impact.ndjson');
    const impactRaw = this.store.exists(impactPath)
      ? this.store.readText(impactPath).trim()
      : '';
    const impact = z
      .array(ImpactEventSchema)
      .parse(impactRaw ? NdJson.parse(impactRaw) : []);

    const bundle: IssueBundle = {
      issue,
      evidence,
      impactEvents: impact,
      path: entry.path,
    };
    this.bundleCache.set(id, bundle);
    return bundle;
  }

  /**
   * List all issue IDs, sorted by year and month.
   * @returns
   */
  listIds(): string[] {
    this.buildIndex();
    const entries = Array.from(this.byId.values());
    entries.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      if (a.month !== b.month) {
        return a.month - b.month;
      }
      return a.issueId.localeCompare(b.issueId);
    });
    return entries.map((entry) => entry.issueId);
  }

  /**
   * List all bundles, sorted by year and month.
   * @returns
   */
  list(): IssueBundle[] {
    this.buildIndex();
    const entries = Array.from(this.byId.values());
    entries.sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      if (a.month !== b.month) {
        return a.month - b.month;
      }
      return a.issueId.localeCompare(b.issueId);
    });
    const result: IssueBundle[] = [];
    for (const entry of entries) {
      const bundle = this.get(entry.issueId);
      if (bundle == null) {
        continue;
      }
      result.push(bundle);
    }
    return result;
  }

  /**
   * Search issues by query.
   * @param query
   * @returns
   */
  searchByQuery(query: string): IssueBundle[] {
    const fuse = new Fuse(this.list(), {
      keys: [
        'issue.id',
        'issue.title.en-SG',
        'evidence.text',
        'impact.scopeItems.serviceId',
        'impact.scopeItems.stationId',
        'impact.scopeItems.fromStationId',
        'impact.scopeItems.toStationId',
      ],
      includeScore: true,
      threshold: 0.8,
    });
    const searchResults = fuse.search({
      $or: [
        { 'issue.id': query },
        { 'issue.title.en-SG': query },
        { 'evidence.text': query },
        { 'impact.scopeItems.serviceId': query },
        { 'impact.scopeItems.stationId': query },
        { 'impact.scopeItems.fromStationId': query },
        { 'impact.scopeItems.toStationId': query },
      ] as Expression[],
    });
    const results: IssueBundle[] = [];
    for (const result of searchResults) {
      const bundle = this.get(result.item.issue.id);
      if (bundle == null) {
        continue;
      }
      results.push(bundle);
    }
    return results;
  }
}
