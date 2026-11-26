import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const receiptLimit = 16 * 1024;
export const summaryLimit = 12 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const text = (value, limit = 300) => String(value ?? '').slice(0, limit);
const cell = (value) =>
  text(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
function bounded(value, limit) {
  if (Buffer.byteLength(value) <= limit) return value;
  const lines = [];
  for (const line of value.split('\n')) {
    if (Buffer.byteLength([...lines, line].join('\n')) > limit - 100) break;
    lines.push(line);
  }
  return `${lines.join('\n')}\n\nFurther details are retained in the full archived reports.\n`;
}

export function reportArchive(report, repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('Invalid archive repository');
  if (
    report.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(report.capture?.sha256) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(report.capture?.retrieved_at) ||
    !Number.isFinite(Date.parse(report.capture.retrieved_at))
  )
    throw new Error('Invalid capture report');
  return `gtfs-capture-reports-${new Date(report.capture.retrieved_at).toISOString().slice(0, 7)}`;
}

/** Full evidence stays outside Git; the receipt and prose have fixed byte budgets. */
export function compactReview(report, markdown, reports) {
  const overview = bounded(
    (markdown.split('\n## Capture and comparison evidence\n')[0] || '')
      .replace(/<details>[\s\S]*?<\/details>/g, '')
      .trim(),
    6 * 1024,
  );
  const receipt = {
    schemaVersion: 2,
    documentKind: 'gtfs-capture-review-receipt',
    capture: report.capture,
    origin: report.origin,
    canonicalCommit: report.canonicalCommit,
    runUrl: report.runUrl,
    artifactUrl: report.artifactUrl,
    inspectionOutcome: report.inspectionOutcome,
    validation: {
      outcome: report.validation?.outcome,
      status: report.validation?.status,
      totals: report.validation?.totals,
      systemErrorCount: report.validation?.systemErrorCount,
    },
    current: report.current && {
      structuralErrorCount: report.current.structuralErrors.length,
      coverage: {
        status: report.current.coverage.status,
        count: report.current.coverage.count,
      },
    },
    baseline: report.baseline?.definition && {
      captureKey: report.baseline.definition.captureKey,
    },
    comparison: {
      status: report.comparison.status,
      reason: text(report.comparison.reason),
      tables: report.comparison.drift?.tables.slice(0, 20).map((table) => ({
        name: text(table.name, 80),
        beforeCount: table.beforeCount,
        afterCount: table.afterCount,
        added: table.added,
        removed: table.removed,
        changed: table.changed,
      })),
    },
    reports,
  };
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  const summary = [
    overview,
    '',
    '## Capture and comparison evidence',
    '',
    `- Retrieved at ${cell(receipt.capture.retrieved_at)}`,
    `- ZIP SHA-256 \`${receipt.capture.sha256}\``,
    `- [Capture receipt](${receipt.origin}/captures/schedule/${receipt.capture.sha256}.json) and [source ZIP](${receipt.origin}/blobs/schedule/${receipt.capture.sha256}.zip)`,
    `- Canonical repository commit \`${receipt.canonicalCommit}\` (context only; mappings have not been reassessed)`,
    `- [Inspection run](${receipt.runUrl})`,
    `- Independent validator: ${cell(receipt.validation.outcome)}; MRTDown inspection: ${cell(receipt.inspectionOutcome)}; structural errors: ${receipt.current?.structuralErrorCount ?? 'unavailable'}`,
    `- Baseline capture: ${cell(receipt.baseline?.captureKey ?? 'unavailable')}`,
    `- Source-date coverage: ${receipt.current?.coverage.count ?? 'unavailable'} active dates; publication coverage requires separate approval.`,
    '',
    '## Archived full reports',
    '',
    ...Object.entries(reports).map(
      ([format, ref]) =>
        `- [Full ${format} report](${ref.url}) — ${ref.byteLength} bytes; SHA-256 \`${ref.sha256}\``,
    ),
    '',
    'Full journey, calendar, table and validation details are retained in these content-addressed Release assets. Git retains this bounded receipt, summary and any publication proof. The comparison baseline and published timetable change only through their separate review gates.',
    '',
    '| Table | Before | After | Added | Removed | Changed IDs |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...(receipt.comparison.tables ?? []).map(
      (table) =>
        `| ${cell(table.name)} | ${table.beforeCount} | ${table.afterCount} | ${table.added} | ${table.removed} | ${table.changed} |`,
    ),
    '',
  ].join('\n');
  if (
    Buffer.byteLength(json) > receiptLimit ||
    Buffer.byteLength(summary) > summaryLimit
  )
    throw new Error('Compact capture evidence exceeds its byte budget');
  return { receipt, json, markdown: summary };
}

/** Never replace assets. Verify GitHub's stored digest and size, including on retries. */
export async function archiveReview({
  report,
  markdown,
  json,
  repository,
  targetCommit,
  request,
}) {
  const tag = reportArchive(report, repository);
  const root = `/repos/${repository}/releases`;
  const lookup = () => request('GET', `${root}/tags/${tag}`);
  let response = await lookup();
  if (response.status === 404) {
    response = await request('POST', root, {
      tag_name: tag,
      target_commitish: targetCommit,
      name: `GTFS capture reports ${tag.slice(-7)}`,
      body: 'Detailed capture inspection evidence. Content-addressed assets are retained without replacement; compact receipts are reviewed in capture PRs.',
      draft: false,
      prerelease: false,
      make_latest: 'false',
    });
    if (response.status === 422) response = await lookup();
  }
  const release = response.data;
  if (
    response.status >= 300 ||
    !Number.isSafeInteger(release?.id) ||
    release.tag_name !== tag ||
    release.draft
  )
    throw new Error('Cannot open the public report archive');
  const findAsset = async (name) => {
    for (let page = 1; ; page++) {
      const result = await request(
        'GET',
        `${root}/${release.id}/assets?per_page=100&page=${page}`,
      );
      if (result.status !== 200 || !Array.isArray(result.data))
        throw new Error('Cannot list archived reports');
      const asset = result.data.find((item) => item.name === name);
      if (asset) return asset;
      if (result.data.length < 100) return undefined;
    }
  };
  const reports = {};
  for (const [format, extension, bytes] of [
    ['json', 'json', Buffer.from(json)],
    ['markdown', 'md', Buffer.from(markdown)],
  ]) {
    const sha256 = hash(bytes);
    const name = `${sha256}.${extension}`;
    let asset = await findAsset(name);
    if (!asset) {
      const uploaded = await request(
        'UPLOAD',
        `${root}/${release.id}/assets?name=${name}`,
        bytes,
        extension,
      );
      if (uploaded.status !== 201 && uploaded.status !== 422)
        throw new Error(`Cannot archive ${format} report (${uploaded.status})`);
      // Read the stored metadata rather than trusting an upload response alone.
      asset = await findAsset(name);
    }
    const url = `https://github.com/${repository}/releases/download/${tag}/${name}`;
    if (
      asset?.state !== 'uploaded' ||
      asset.size !== bytes.length ||
      asset.digest !== `sha256:${sha256}` ||
      asset.browser_download_url !== url
    )
      throw new Error(`Archived ${format} report identity differs`);
    reports[format] = { url, sha256, byteLength: bytes.length };
  }
  return compactReview(report, markdown, reports);
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const env = process.env;
  const [inputDir, outputDir, captureSha256] = process.argv.slice(2);
  if (!/^[a-f0-9]{64}$/.test(captureSha256))
    throw new Error('Invalid capture identity');
  const json = await readFile(join(inputDir, `${captureSha256}.json`), 'utf8');
  const markdown = await readFile(
    join(inputDir, `${captureSha256}.md`),
    'utf8',
  );
  const report = JSON.parse(json);
  if (report.capture?.sha256 !== captureSha256)
    throw new Error('Report belongs to another capture');
  const result = await archiveReview({
    report,
    markdown,
    json,
    repository: env.GITHUB_REPOSITORY,
    targetCommit: env.GITHUB_SHA,
    request: async (method, path, body, extension) => {
      const upload = method === 'UPLOAD';
      const response = await fetch(
        `https://${upload ? 'uploads' : 'api'}.github.com${path}`,
        {
          method: upload ? 'POST' : method,
          headers: {
            Authorization: `Bearer ${env.GH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': upload
              ? extension === 'json'
                ? 'application/json'
                : 'text/markdown'
              : 'application/json',
          },
          body:
            body === undefined
              ? undefined
              : upload
                ? body
                : JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(60000),
        },
      );
      return { status: response.status, data: await response.json() };
    },
  });
  // A failed upload never leaves a qualifying pair in the output directory.
  await mkdir(outputDir);
  await writeFile(join(outputDir, `${captureSha256}.json`), result.json);
  await writeFile(join(outputDir, `${captureSha256}.md`), result.markdown);
}
