import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  archiveReview,
  compactReview,
  reportArchive,
} from './archive-gtfs-capture-review.mjs';

const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const report = {
    schemaVersion: 1,
    capture: { sha256: 'a'.repeat(64), retrieved_at: '2026-11-25T20:00:00Z' },
    origin: 'https://sources.example.com',
    canonicalCommit: 'b'.repeat(40),
    runUrl: 'https://github.com/example/repo/actions/runs/123',
    validation: {
      outcome: 'success',
      totals: { WARNING: 4 },
      notices: [{ examples: ['detail'] }],
    },
    inspectionOutcome: 'success',
    current: {
      structuralErrors: [],
      coverage: { status: 'available', count: 365, dates: ['expanded'] },
    },
    baseline: {
      definition: { captureKey: `captures/schedule/${'c'.repeat(64)}.json` },
      summary: { expanded: 'detail' },
    },
    comparison: {
      status: 'available',
      journeys: { expanded: 'detail' },
      drift: {
        tables: [
          {
            name: 'trips',
            beforeCount: 5,
            afterCount: 6,
            added: 1,
            removed: 0,
            changed: 0,
            changedExamples: ['detail'],
          },
        ],
      },
    },
  };
  const json = `${JSON.stringify(report)}\n`;
  const markdown =
    '# Snapshot\n\n## What changed\n\nCircle Line has one more journey.\n\n<details>\nExpanded examples\n</details>\n\n## Capture and comparison evidence\n\nFull coverage and notices\n';
  const requests: { method: string; path: string; body: unknown }[] = [];
  const assets: {
    name: string;
    size: number;
    digest: string;
    state: string;
    browser_download_url: string;
  }[] = [];
  let exists = false;
  const request = async (method: string, path: string, body?: unknown) => {
    requests.push({ method, path, body });
    if (path.includes('/tags/'))
      return {
        status: exists ? 200 : 404,
        data: { id: 7, tag_name: 'gtfs-capture-reports-2026-11', draft: false },
      };
    if (method === 'POST') {
      exists = true;
      return {
        status: 201,
        data: { id: 7, tag_name: 'gtfs-capture-reports-2026-11', draft: false },
      };
    }
    if (method === 'UPLOAD') {
      const name = path.split('name=')[1];
      const bytes = body as Buffer;
      assets.push({
        name,
        size: bytes.length,
        digest: `sha256:${hash(bytes)}`,
        state: 'uploaded',
        browser_download_url: `https://github.com/example/repo/releases/download/gtfs-capture-reports-2026-11/${name}`,
      });
      return { status: 201, data: {} };
    }
    return { status: 200, data: assets };
  };
  const args = {
    report,
    markdown,
    json,
    repository: 'example/repo',
    targetCommit: 'b'.repeat(40),
    request,
  };
  return { args, assets, requests, request };
}

describe('durable capture evidence outside Git', () => {
  it('archives exact full bytes and commits only a bounded receipt and overview', async () => {
    const { args, requests } = fixture();
    const result = await archiveReview(args);
    expect(requests.find((call) => call.method === 'POST')?.body).toMatchObject(
      {
        make_latest: 'false',
        draft: false,
        target_commitish: args.targetCommit,
      },
    );
    expect(
      requests
        .filter((call) => call.method === 'UPLOAD')
        .map((call) => (call.body as Buffer).toString()),
    ).toEqual([args.json, args.markdown]);
    expect(result.receipt.reports.json.sha256).toBe(hash(args.json));
    expect(result.receipt.reports.markdown.byteLength).toBe(
      Buffer.byteLength(args.markdown),
    );
    expect(result.receipt.current.structuralErrorCount).toBe(0);
    expect(result.json).not.toContain('expanded');
    expect(result.json).not.toContain('changedExamples');
    expect(result.markdown).toContain('Circle Line has one more journey.');
    expect(result.markdown).toContain(result.receipt.reports.json.url);
    expect(result.markdown).not.toContain('Expanded examples');
    expect(result.markdown).not.toContain('Full coverage and notices');
  });

  it('reuses verified assets on retry and retains prior assets when run context changes', async () => {
    const { args, requests, assets } = fixture();
    const first = await archiveReview(args);
    requests.splice(0);
    expect(await archiveReview(args)).toEqual(first);
    expect(requests.every((call) => call.method === 'GET')).toBe(true);
    args.json = `${args.json.trimEnd()}\n\n`;
    await archiveReview(args);
    expect(assets).toHaveLength(3);
    expect(assets[0].digest).toBe(
      `sha256:${first.receipt.reports.json.sha256}`,
    );
  });

  it.each([
    'digest',
    'size',
    'url',
    'state',
  ])('refuses conflicting stored %s instead of replacing it', async (field) => {
    const { args, assets, requests } = fixture();
    await archiveReview(args);
    if (field === 'digest') assets[0].digest = `sha256:${'0'.repeat(64)}`;
    if (field === 'size') assets[0].size++;
    if (field === 'url')
      assets[0].browser_download_url = 'https://example.com/wrong';
    if (field === 'state') assets[0].state = 'starter';
    requests.splice(0);
    await expect(archiveReview(args)).rejects.toThrow('identity differs');
    expect(requests.every((call) => call.method === 'GET')).toBe(true);
  });

  it('recovers concurrent release and asset creation by refetching and verifying', async () => {
    const { args, request } = fixture();
    args.request = async (method, path, body) => {
      const response = await request(method, path, body);
      return method === 'POST' || method === 'UPLOAD'
        ? { status: 422, data: {} }
        : response;
    };
    expect((await archiveReview(args)).receipt.reports.json.sha256).toBe(
      hash(args.json),
    );
  });

  it('finds old assets beyond the first page without uploading duplicates', async () => {
    const { args, request, requests } = fixture();
    await archiveReview(args);
    requests.splice(0);
    args.request = async (method, path, body) =>
      path.endsWith('&page=1')
        ? {
            status: 200,
            data: Array.from({ length: 100 }, (_, index) => ({
              name: `other-${index}`,
            })),
          }
        : request(method, path, body);
    await archiveReview(args);
    expect(requests.every((call) => call.method === 'GET')).toBe(true);
  });

  it.each([
    'creation',
    'upload',
    'listing',
  ])('fails closed when %s is unavailable', async (failure) => {
    const { args, request } = fixture();
    args.request = async (method, path, body) =>
      (failure === 'creation' && method === 'POST') ||
      (failure === 'upload' && method === 'UPLOAD') ||
      (failure === 'listing' && path.includes('/assets?') && method === 'GET')
        ? { status: 503, data: {} }
        : request(method, path, body);
    await expect(archiveReview(args)).rejects.toThrow();
  });

  it('bounds UTF-8 summaries as journey groups and expanded JSON grow', async () => {
    const { args } = fixture();
    const refs = (await archiveReview(args)).receipt.reports;
    const overview = `# Snapshot\n\n## What changed\n\n${'Train details 🚉\n'.repeat(2000)}\n## Capture and comparison evidence\n`;
    const result = compactReview(args.report, overview, refs);
    expect(Buffer.byteLength(result.markdown)).toBeLessThanOrEqual(12 * 1024);
    expect(Buffer.byteLength(result.json)).toBeLessThanOrEqual(16 * 1024);
    expect(result.markdown).toContain('Further details');
    expect(result.markdown).not.toContain('�');
    args.report.capture = { ...args.report.capture, huge: 'x'.repeat(20000) };
    expect(() => compactReview(args.report, overview, refs)).toThrow(
      'byte budget',
    );
  });

  it('rejects invalid capture identities before touching a release', async () => {
    const { args, requests } = fixture();
    args.report.capture.sha256 = '../bad';
    await expect(archiveReview(args)).rejects.toThrow('Invalid capture');
    expect(requests).toHaveLength(0);
    expect(() => reportArchive(args.report, 'bad/repo/extra')).toThrow(
      'repository',
    );
  });
});
