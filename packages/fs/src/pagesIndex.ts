import type { Manifest } from '@mrtdown/core';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderPagesIndex(manifest: Manifest): string {
  const counts = [
    ['Lines', Object.keys(manifest.lines).length],
    ['Stations', Object.keys(manifest.stations).length],
    ['Services', Object.keys(manifest.services).length],
    ['Operators', Object.keys(manifest.operators).length],
    ['Towns', Object.keys(manifest.towns).length],
    ['Landmarks', Object.keys(manifest.landmarks).length],
    ['Issues', Object.keys(manifest.issues).length],
  ];

  const rows = counts
    .map(
      ([label, count]) =>
        `<tr><th scope="row">${escapeHtml(String(label))}</th><td>${count}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MRTDown data</title>
  </head>
  <body>
    <main>
      <h1>MRTDown data</h1>
      <p>Generated at <time datetime="${escapeHtml(manifest.generatedAt)}">${escapeHtml(manifest.generatedAt)}</time>.</p>
      <p><a href="manifest.json">manifest.json</a></p>
      <table>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </main>
  </body>
</html>
`;
}
