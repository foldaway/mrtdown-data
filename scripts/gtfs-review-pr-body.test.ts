import { expect, test } from 'vitest';
import { prBodyCharacterLimit, renderPrBody } from './gtfs-review-pr-body.mjs';

const reportUrl = `https://github.com/example/repo/blob/${'a'.repeat(40)}/docs/gtfs/captures/${'b'.repeat(64)}.md`;

test('short descriptions preserve the report and link to the complete immutable evidence', () => {
  const markdown = '# Snapshot\n\nCircle Line changes.\n';
  const body = renderPrBody(markdown, reportUrl);
  expect(body).toContain(markdown);
  expect(body).toContain(`[Read the complete capture report](${reportUrl})`);
  expect(body).not.toContain('shortened');
});

test('large departure details are omitted from the PR overview with an explicit full-report link', () => {
  const overview =
    '# Snapshot\n\n## What changed\n\nCircle Line gains 17 journeys.\n';
  const details = `<details>\n<summary>Examples</summary>\n${'A detailed departure example.\n'.repeat(5000)}</details>\n`;
  const markdown = `${overview}${details}## Validation\n\nNo structural errors.\n`;
  const body = renderPrBody(markdown, reportUrl);
  expect(body).toContain(overview);
  expect(body).toContain('No structural errors.');
  expect(body).not.toContain('<details>');
  expect(body).toContain('description is shortened');
  expect(body).toContain(reportUrl);
  expect(Array.from(body).length).toBeLessThanOrEqual(prBodyCharacterLimit);
  expect(markdown).toContain(details);
});

test('large unstructured Unicode reports fit the character and byte budgets without splitting surrogate pairs', () => {
  const body = renderPrBody('🚆'.repeat(100_000), reportUrl);
  expect(Array.from(body).length).toBeLessThanOrEqual(prBodyCharacterLimit);
  expect(Buffer.byteLength(body, 'utf8')).toBeLessThanOrEqual(
    prBodyCharacterLimit * 4,
  );
  expect(Buffer.from(body, 'utf8').toString('utf8')).toBe(body);
  expect(body).toContain(reportUrl);
  expect(body).toContain('description is shortened');
});
