import type { Manifest } from '@mrtdown/core';

export type PagesIndexOptions = {
  includeArchiveLinks?: boolean;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderCode(value: string): string {
  return `<pre>${escapeHtml(value)}</pre>`;
}

function renderExportLinks(options: PagesIndexOptions): string {
  const archiveLinks = options.includeArchiveLinks
    ? ` The full data directory is also available as <a href="archive.tar.gz">archive.tar.gz</a> (gzipped tarball) or <a href="archive.zip">archive.zip</a>.`
    : '';

  return `<p>Static data index for Singapore MRT/LRT status and history. The machine-readable manifest is published as <a href="manifest.json">manifest.json</a>.${archiveLinks} Records are listed in alphabetical order by ID.</p>`;
}

function renderTable(title: string, records: Record<string, string>): string {
  const rows = Object.entries(records)
    .map(
      ([id, path]) => `<tr>
          <td>${renderCode(id)}</td>
          <td><a href="${escapeHtml(path)}">${escapeHtml(path)}</a></td>
        </tr>`,
    )
    .join('');

  return `<h2>${escapeHtml(title)}</h2>
      <table>
        <tbody>
          <tr>
            <th>ID</th>
            <th>Link</th>
          </tr>
          ${rows}
        </tbody>
      </table>`;
}

export function renderPagesIndex(
  manifest: Manifest,
  options: PagesIndexOptions = {},
): string {
  const sections = [
    ['Lines', manifest.lines],
    ['Towns', manifest.towns],
    ['Landmarks', manifest.landmarks],
    ['Operators', manifest.operators],
    ['Services', manifest.services],
    ['Stations', manifest.stations],
    ['Issues', manifest.issues],
  ] satisfies Array<[string, Record<string, string>]>;
  const tables = sections
    .map(([title, records]) => renderTable(title, records))
    .join('');
  const generatedAt = new Date(manifest.generatedAt);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>mrtdown-data</title>
    <style>
:root { font-family: system-ui, sans-serif; line-height: 1.5; }
body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
h1 { font-size: 1.5rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #ddd; }
th { font-weight: 600; width: 40%; }
pre { word-break: break-word; white-space: pre-wrap; display: inline; background-color: #f0f0f0; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
footer { margin-top: 2rem; font-size: 0.875rem; color: #555; }
a { color: #0b57d0; }
    </style>
  </head>
  <body>
    <h1>mrtdown-data</h1>
    ${renderExportLinks(options)}
    <a href="https://github.com/foldaway/mrtdown-data">GitHub repository</a>
    ${tables}
    <footer>
      Generated at <time datetime="${escapeHtml(manifest.generatedAt)}">${escapeHtml(generatedAt.toUTCString())}</time> (UTC) on ${escapeHtml(process.platform)}/${escapeHtml(process.arch)}
    </footer>
  </body>
</html>
`;
}
