import { execFileSync } from 'node:child_process';

const {
  GITHUB_REPOSITORY: repo,
  GITHUB_RUN_ID: run,
  SNAPSHOT_SHA256: sha,
  AUTOMATIC_DECISION: decision,
} = process.env;
if (
  repo !== 'foldaway/mrtdown-data' ||
  !/^\d+$/.test(run ?? '') ||
  !/^[a-f0-9]{64}$/.test(sha ?? '') ||
  !['published', 'unchanged'].includes(decision)
)
  throw new Error('Expected a completed trusted GTFS publication run');
const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
const reviews = JSON.parse(
  gh([
    'api',
    '--method',
    'GET',
    `repos/${repo}/pulls`,
    '-f',
    'state=open',
    '-f',
    `head=foldaway:gtfs-review/${sha}`,
  ]),
);
if (reviews.length > 1)
  throw new Error('Multiple open reviews for one snapshot');
for (const review of reviews) {
  if (
    review.head.repo?.full_name !== repo ||
    review.head.ref !== `gtfs-review/${sha}`
  )
    throw new Error('Snapshot review identity differs');
  const url = `https://github.com/${repo}/actions/runs/${run}`;
  const oldBody = review.body ?? '';
  const reportStart = oldBody.indexOf('# LTA train GTFS snapshot');
  const report = reportStart >= 0 ? oldBody.slice(reportStart) : oldBody;
  const prefix = `## Automatic publication\n\n**Completed.** This exact snapshot is the verified published release${decision === 'unchanged' ? ' (already current)' : ''}. The publication flow checked the bundle, completed the site import and retained the release. [Publication receipt](${url}).\n\nThis review is closed automatically; no evidence-only merge is needed. The source report below records the original comparison.\n\n`;
  const body = Array.from(prefix + report)
    .slice(0, 60_000)
    .join('');
  gh(
    [
      'api',
      '--method',
      'PATCH',
      `repos/${repo}/pulls/${review.number}`,
      '--input',
      '-',
    ],
    JSON.stringify({ state: 'closed', body }),
  );
  console.log(`Closed completed snapshot review #${review.number}: ${url}`);
}
