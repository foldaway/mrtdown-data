import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const policyPath = 'docs/gtfs/operations/automatic-publication-policy.json';
const digest = /^[a-f0-9]{64}$/;
const id = /^[1-9][0-9]*$/;

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

// Bind every prepared file, including source approvals and the source ZIP.
export async function preparedContentSha256(directory) {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    requireCheck(
      (await lstat(join(directory, name))).isFile(),
      'Prepared release must contain only regular files',
    );
    files.push([name, hash(await readFile(join(directory, name)))]);
  }
  return hash(JSON.stringify(files));
}

export function validateRequest(request, sha256) {
  requireCheck(
    request.schemaVersion === 1 &&
      request.captureSha256 === sha256 &&
      digest.test(sha256) &&
      [
        'contentSha256',
        'manifestSha256',
        'predecessorManifestSha256',
        'policySha256',
      ].every((key) => digest.test(request[key])) &&
      id.test(String(request.runId)) &&
      id.test(String(request.artifactId)),
    'Invalid reviewed GTFS publication request',
  );
  return request;
}

export function mergedCapture(event, repo) {
  const pr = event.pull_request;
  if (!pr?.merged || !pr.head?.ref?.startsWith('gtfs-review/')) return null;
  requireCheck(
    event.action === 'closed' &&
      repo === 'foldaway/mrtdown-data' &&
      pr.head.repo?.full_name === repo &&
      pr.base.repo?.full_name === repo &&
      pr.base.ref === 'main' &&
      /^[a-f0-9]{40}$/.test(pr.merge_commit_sha),
    'Expected a merged same-repository GTFS review targeting main',
  );
  const sha256 = pr.head.ref.slice('gtfs-review/'.length);
  requireCheck(digest.test(sha256), 'Invalid GTFS review branch');
  return sha256;
}

export function validatePreparationRun(request, run, artifact, repo) {
  requireCheck(
    String(run.id) === String(request.runId) &&
      run.path === '.github/workflows/gtfs-capture.yml' &&
      ['repository_dispatch', 'workflow_dispatch'].includes(run.event) &&
      run.head_branch === 'main' &&
      run.head_repository?.full_name === repo &&
      run.conclusion === 'success' &&
      String(artifact.id) === String(request.artifactId) &&
      String(artifact.workflow_run?.id) === String(request.runId) &&
      artifact.name === `gtfs-prepared-${run.id}-${run.run_attempt}` &&
      artifact.expired === false,
    'Prepared release must come from a successful trusted capture run with an unexpired artifact',
  );
}

export async function verifyPreparedRelease(
  directory,
  baseline,
  request,
  {
    now = new Date(),
    terms = async () =>
      (await import('../packages/cli/dist/gtfsTerms.js')).acquireGtfsTerms(),
  } = {},
) {
  validateRequest(request, request.captureSha256);
  requireCheck(
    (await preparedContentSha256(directory)) === request.contentSha256 &&
      hash(await readFile(policyPath)) === request.policySha256,
    'Prepared release or publication policy differs from the reviewed content',
  );
  const [capture, index, sourceReview, current, evidence, applicability] =
    await Promise.all([
      json(join(directory, 'capture.json')),
      json(join(directory, 'release-index.json')),
      json(join(directory, 'source-review.json')),
      json(join(baseline, 'release-index.json')),
      json(join(directory, 'release-evidence.json')),
      json(join(directory, 'applicabilityPolicy.json')),
    ]);
  requireCheck(
    capture.sha256 === request.captureSha256 &&
      index.manifestSha256 === request.manifestSha256 &&
      sourceReview.predecessor.manifestSha256 ===
        request.predecessorManifestSha256 &&
      sourceReview.successor.manifestSha256 === request.manifestSha256 &&
      sourceReview.successor.snapshotSha256 === request.captureSha256,
    'Prepared release identities differ from the merged review',
  );
  if (isDeepStrictEqual(current, index)) return 'unchanged';
  requireCheck(
    current.manifestSha256 === request.predecessorManifestSha256,
    'Published baseline changed while the PR was open; prepare a fresh review',
  );
  const policy = await json(policyPath);
  const age = now.getTime() - Date.parse(capture.retrieved_at);
  requireCheck(
    age >= 0 && age <= policy.maximumCaptureAgeHours * 60 * 60 * 1000,
    'Reviewed capture is stale; prepare a fresh review',
  );
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const range = applicability.serviceDateRange;
  requireCheck(
    today >= range.startDate && today < range.endDateExclusive,
    'Reviewed service-date window has expired or has not started',
  );
  requireCheck(
    isDeepStrictEqual(await terms(), evidence.currentTerms),
    'Source terms changed while the PR was open; prepare a fresh review',
  );
  return 'ready';
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const [mode, directory, destination] = process.argv.slice(2);
  const env = process.env;
  if (mode === 'describe') {
    const [capture, index, sourceReview] = await Promise.all([
      json(join(directory, 'capture.json')),
      json(join(directory, 'release-index.json')),
      json(join(directory, 'source-review.json')),
    ]);
    const request = {
      schemaVersion: 1,
      captureSha256: capture.sha256,
      manifestSha256: index.manifestSha256,
      predecessorManifestSha256: sourceReview.predecessor.manifestSha256,
      contentSha256: await preparedContentSha256(directory),
      policySha256: hash(await readFile(policyPath)),
      runId: env.GITHUB_RUN_ID,
    };
    await writeFile(destination, `${JSON.stringify(request, null, 2)}\n`);
  } else if (mode === 'request') {
    const request = await json(directory);
    request.artifactId = env.PREPARED_ARTIFACT_ID;
    validateRequest(request, env.SNAPSHOT_SHA256);
    await writeFile(destination, `${JSON.stringify(request, null, 2)}\n`);
  } else if (mode === 'merged') {
    const event = await json(env.GITHUB_EVENT_PATH);
    const sha256 = mergedCapture(event, env.GITHUB_REPOSITORY);
    if (!sha256) throw new Error('Expected a merged GTFS review');
    const path = `docs/gtfs/captures/${sha256}.publication.json`;
    // PR files work for merge commits, squash merges and multi-commit rebases.
    const files = execFileSync(
      'gh',
      [
        'api',
        `repos/${env.GITHUB_REPOSITORY}/pulls/${event.number}/files`,
        '--paginate',
        '--jq',
        '.[].filename',
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    if (!files.includes(path)) {
      await writeFile(
        env.GITHUB_STEP_SUMMARY,
        'This capture has no prepared publication request. Follow the exception release procedure or prepare a new review.\n',
        { flag: 'a' },
      );
      process.exit(0);
    }
    const request = validateRequest(
      JSON.parse(
        execFileSync(
          'git',
          ['show', `${event.pull_request.merge_commit_sha}:${path}`],
          { encoding: 'utf8' },
        ),
      ),
      sha256,
    );
    const gh = (path) =>
      JSON.parse(
        execFileSync('gh', ['api', `repos/${env.GITHUB_REPOSITORY}/${path}`], {
          encoding: 'utf8',
        }),
      );
    validatePreparationRun(
      request,
      gh(`actions/runs/${request.runId}`),
      gh(`actions/artifacts/${request.artifactId}`),
      env.GITHUB_REPOSITORY,
    );
    await writeFile(env.GITHUB_OUTPUT, `request=${JSON.stringify(request)}\n`, {
      flag: 'a',
    });
  } else if (mode === 'verify') {
    const request = JSON.parse(env.REVIEWED_REQUEST);
    const decision = await verifyPreparedRelease(
      directory,
      destination,
      request,
    );
    await writeFile(
      env.GITHUB_OUTPUT,
      `publish=${decision === 'ready'}\ndecision=${decision}\n`,
      { flag: 'a' },
    );
  } else {
    throw new Error('Expected describe, request, merged or verify mode');
  }
}
