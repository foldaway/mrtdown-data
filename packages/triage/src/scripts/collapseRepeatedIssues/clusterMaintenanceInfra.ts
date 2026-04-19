import type { IssueBundle, IssueType } from '@mrtdown/core';

/** One day in ms — ranges within this gap count as adjacent. */
export const DEFAULT_ADJACENCY_MS = 86_400_000;

export type IssueTimeRange = {
  issueId: string;
  normalizedSlug: string;
  type: IssueType;
  startMs: number;
  endMs: number;
  /** How the span was derived */
  source: 'impact-periods' | 'evidence-only';
};

export function normalizedSlugFromIssueId(issueId: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/.exec(issueId);
  if (!m) {
    throw new Error(`Invalid issue id (expected YYYY-MM-DD-slug): ${issueId}`);
  }
  return m[4];
}

/**
 * Earliest start and latest end from `periods.set` impact rows; falls back to
 * evidence timestamps when there are no period rows.
 */
export function extractTimeRange(bundle: IssueBundle): IssueTimeRange | null {
  const { issue, evidence, impactEvents } = bundle;
  let minS = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  let hasPeriod = false;

  for (const ev of impactEvents) {
    if (ev.type !== 'periods.set') continue;
    const eventTs = Date.parse(ev.ts);
    for (const p of ev.periods) {
      hasPeriod = true;
      if (p.kind === 'fixed') {
        const s = Date.parse(p.startAt);
        const e = p.endAt != null ? Date.parse(p.endAt) : Math.max(eventTs, s);
        minS = Math.min(minS, s);
        maxE = Math.max(maxE, e);
      } else {
        minS = Math.min(minS, Date.parse(p.startAt));
        maxE = Math.max(maxE, Date.parse(p.endAt));
      }
    }
  }

  let source: IssueTimeRange['source'] = 'impact-periods';
  if (!hasPeriod && evidence.length > 0) {
    source = 'evidence-only';
    for (const e of evidence) {
      const t = Date.parse(e.ts);
      minS = Math.min(minS, t);
      maxE = Math.max(maxE, t);
    }
  }

  if (minS === Number.POSITIVE_INFINITY) {
    return null;
  }
  if (maxE < minS) {
    maxE = minS;
  }

  return {
    issueId: issue.id,
    normalizedSlug: normalizedSlugFromIssueId(issue.id),
    type: issue.type,
    startMs: minS,
    endMs: maxE,
    source,
  };
}

export function intervalsOverlapOrAdjacent(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
  adjacencyMs: number,
): boolean {
  const [x, y] = a.startMs <= b.startMs ? [a, b] : [b, a];
  if (x.endMs >= y.startMs) {
    return true;
  }
  return y.startMs - x.endMs <= adjacencyMs;
}

class UnionFind {
  private readonly parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(i: number): number {
    if (this.parent[i] !== i) {
      this.parent[i] = this.find(this.parent[i]);
    }
    return this.parent[i];
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent[ra] = rb;
    }
  }
}

export type CollapseCluster = {
  clusterId: string;
  normalizedSlug: string;
  type: IssueType;
  members: IssueTimeRange[];
  canonicalIssueId: string;
  /** Pairs (i,j) that caused union — for audit */
  adjacencyEvidence: { a: string; b: string; reason: 'overlap' | 'adjacent' }[];
};

function pairwiseReason(
  a: IssueTimeRange,
  b: IssueTimeRange,
  adjacencyMs: number,
): 'overlap' | 'adjacent' | null {
  const [x, y] = a.startMs <= b.startMs ? [a, b] : [b, a];
  if (x.endMs >= y.startMs) {
    return 'overlap';
  }
  if (y.startMs - x.endMs <= adjacencyMs) {
    return 'adjacent';
  }
  return null;
}

/**
 * Cluster issues that share slug+type and whose time ranges overlap or are
 * within `adjacencyMs` of each other (transitive closure).
 */
export function clusterBySlugTypeAndTime(
  ranges: IssueTimeRange[],
  adjacencyMs: number,
): CollapseCluster[] {
  const byKey = new Map<string, IssueTimeRange[]>();
  for (const r of ranges) {
    const key = `${r.normalizedSlug}\0${r.type}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  const clusters: CollapseCluster[] = [];

  for (const [key, group] of byKey) {
    const n = group.length;
    if (n < 2) {
      continue;
    }

    const uf = new UnionFind(n);
    const evidence: CollapseCluster['adjacencyEvidence'] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (intervalsOverlapOrAdjacent(group[i], group[j], adjacencyMs)) {
          uf.union(i, j);
          const reason = pairwiseReason(group[i], group[j], adjacencyMs);
          if (reason) {
            evidence.push({
              a: group[i].issueId,
              b: group[j].issueId,
              reason,
            });
          }
        }
      }
    }

    const byRoot = new Map<number, IssueTimeRange[]>();
    for (let i = 0; i < n; i++) {
      const root = uf.find(i);
      const list = byRoot.get(root) ?? [];
      list.push(group[i]);
      byRoot.set(root, list);
    }

    const [slug] = key.split('\0');
    for (const members of byRoot.values()) {
      if (members.length < 2) {
        continue;
      }
      members.sort((a, b) => a.issueId.localeCompare(b.issueId));
      const canonicalIssueId = pickCanonical(members);
      clusters.push({
        clusterId: `${slug}:${members[0].type}:${canonicalIssueId}`,
        normalizedSlug: slug,
        type: members[0].type,
        members,
        canonicalIssueId,
        adjacencyEvidence: evidence.filter(
          (e) =>
            members.some((m) => m.issueId === e.a) &&
            members.some((m) => m.issueId === e.b),
        ),
      });
    }
  }

  clusters.sort((a, b) => a.clusterId.localeCompare(b.clusterId));
  return clusters;
}

/** Earliest start; tie-break lexicographically smallest issue id. */
export function pickCanonical(members: IssueTimeRange[]): string {
  let best = members[0];
  for (const m of members) {
    if (m.startMs < best.startMs) {
      best = m;
    } else if (m.startMs === best.startMs && m.issueId < best.issueId) {
      best = m;
    }
  }
  return best.issueId;
}
