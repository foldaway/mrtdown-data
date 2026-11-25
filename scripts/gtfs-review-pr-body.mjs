import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Reserve space below GitHub's body limit, including four-byte Unicode text.
export const prBodyCharacterLimit = 60_000;

export function renderPrBody(markdown, reportUrl) {
  const url = new URL(reportUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Expected an HTTPS report URL without credentials');
  }
  const link = `\n\n[Read the complete capture report](${url.href}).\n`;
  const notice =
    '\n\nThis PR description is shortened. Complete evidence and departure examples are in the linked report.';
  const suffix = notice + link;
  if (Array.from(suffix).length >= prBodyCharacterLimit) {
    throw new Error('Report URL exceeds the PR body budget');
  }
  if (Array.from(markdown + link).length <= prBodyCharacterLimit) {
    return markdown + link;
  }

  const budget = prBodyCharacterLimit - Array.from(suffix).length;
  const overview = markdown.replace(/<details>[\s\S]*?<\/details>/g, '');
  const prefix = Array.from(overview).slice(0, budget).join('');
  const boundary = prefix.lastIndexOf('\n');
  return (boundary > 0 ? prefix.slice(0, boundary) : prefix).trimEnd() + suffix;
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const [file, reportUrl] = process.argv.slice(2);
  if (!file || !reportUrl) {
    throw new Error(
      'Usage: node scripts/gtfs-review-pr-body.mjs <committed-report.md> <report-url>',
    );
  }
  process.stdout.write(renderPrBody(await readFile(file, 'utf8'), reportUrl));
}
