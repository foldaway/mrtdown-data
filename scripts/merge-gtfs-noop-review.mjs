import { execFileSync } from 'node:child_process';
import { appendFile, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const digest = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const publication =
  '## Publication approval\n\nNo publication needed. The completed timetable and desired definition remain unchanged. This PR records capture evidence only.';
class Ineligible extends Error {}
function requireCheck(condition, reason) {
  if (!condition) throw new Ineligible(reason);
}
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const singaporeDate = (now) => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};

/** The input is the preparation artifact of this trusted run, never the PR body. */
export function validateNoopPreparation(report, context, now) {
  const preparation = report.preparation;
  requireCheck(
    report.decision === 'no-op' &&
      digest.test(report.retainedManifestSha256) &&
      Array.isArray(report.reasons) &&
      report.reasons.length > 0,
    'No complete no-op result.',
  );
  requireCheck(
    ![
      'bundle',
      'releaseIndex',
      'mappingApproval',
      'releaseReview',
      'sourceReview',
    ].some((key) => key in report),
    'A successor release cannot be auto-merged.',
  );
  requireCheck(
    preparation?.captureSha256 === context.captureSha256 &&
      digest.test(preparation.baselineCaptureSha256) &&
      preparation.runUrl ===
        `https://github.com/${context.repository}/actions/runs/${context.runId}`,
    'Preparation belongs to another capture or run.',
  );
  requireCheck(
    preparation.baselineReleaseIndex?.manifestSha256 ===
      report.retainedManifestSha256,
    'Retained release identity differs.',
  );
  const checkedAt = Date.parse(preparation.checkedAt);
  const capturedAt = Date.parse(preparation.captureRetrievedAt);
  requireCheck(
    Number.isFinite(checkedAt) &&
      checkedAt <= now &&
      now - checkedAt <= 3600000 &&
      Number.isFinite(capturedAt) &&
      capturedAt <= checkedAt &&
      now - capturedAt <= 72 * 3600000,
    'No-op preparation or capture is stale.',
  );
  const range = preparation.serviceDateRange;
  const today = singaporeDate(now);
  requireCheck(
    range && today >= range.startDate && today < range.endDateExclusive,
    'The approved service-date window is inactive.',
  );
  const proof = report.retainedTimetableProof;
  if (proof) {
    requireCheck(
      proof.documentKind === 'gtfs-retained-timetable-no-op-proof' &&
        proof.schemaVersion === 1 &&
        proof.candidateCaptureSha256 === context.captureSha256 &&
        proof.baselineCaptureSha256 === preparation.baselineCaptureSha256 &&
        proof.retainedManifestSha256 === report.retainedManifestSha256 &&
        proof.checkedAt === preparation.checkedAt &&
        proof.unchangedFromServiceDate === singaporeDate(checkedAt) &&
        proof.policyRevision === 'canonical-schedule-v3' &&
        digest.test(proof.policySha256) &&
        Array.isArray(proof.expiredServiceDates) &&
        Array.isArray(proof.outsideApprovedServiceDates) &&
        isDeepStrictEqual(proof.serviceDateRange, range),
      'Retained timetable proof differs from preparation.',
    );
  } else {
    requireCheck(
      Array.isArray(report.historicalChanges?.serviceDates) &&
        report.historicalChanges.serviceDates.length > 0,
      'Expired-service proof is missing.',
    );
  }
  return preparation;
}

/** Require the exact bounded receipt produced after this run verified durable assets. */
export function validateNoopEvidence(
  { actualJson, freshJson, actualMarkdown, freshMarkdown, automaticMarkdown },
  context,
) {
  requireCheck(
    Buffer.byteLength(
      typeof actualJson === 'string'
        ? actualJson
        : (JSON.stringify(actualJson) ?? ''),
    ) <=
      16 * 1024 && Buffer.byteLength(actualMarkdown) <= 32 * 1024,
    'Committed capture evidence exceeds its byte budget.',
  );
  if (typeof actualJson === 'string') {
    try {
      actualJson = JSON.parse(actualJson);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Ineligible('Committed comparison JSON is malformed.');
      throw error;
    }
  }
  requireCheck(
    actualJson !== null &&
      typeof actualJson === 'object' &&
      !Array.isArray(actualJson),
    'Committed comparison JSON must be an object.',
  );
  requireCheck(
    actualJson.schemaVersion === 2 &&
      actualJson.documentKind === 'gtfs-capture-review-receipt' &&
      actualJson.capture?.sha256 === context.captureSha256 &&
      freshJson.capture?.sha256 === context.captureSha256 &&
      actualJson.comparison?.status === 'available' &&
      actualJson.inspectionOutcome === 'success' &&
      actualJson.validation?.outcome === 'success' &&
      actualJson.current?.structuralErrorCount === 0,
    'Capture comparison or validation is incomplete.',
  );
  requireCheck(
    isDeepStrictEqual(actualJson, freshJson),
    'Committed comparison differs from the trusted inspection.',
  );
  requireCheck(
    actualJson.canonicalCommit === context.workflowSha &&
      actualJson.runUrl ===
        `https://github.com/${context.repository}/actions/runs/${context.runId}`,
    'Capture receipt belongs to another commit or run.',
  );
  for (const [format, extension] of [
    ['json', 'json'],
    ['markdown', 'md'],
  ]) {
    const ref = actualJson.reports?.[format];
    const capturedAt = Date.parse(actualJson.capture.retrieved_at);
    const tag = Number.isFinite(capturedAt)
      ? `gtfs-capture-reports-${new Date(capturedAt).toISOString().slice(0, 7)}`
      : '';
    requireCheck(
      tag &&
        digest.test(ref?.sha256) &&
        Number.isSafeInteger(ref?.byteLength) &&
        ref.byteLength > 0 &&
        ref.url ===
          `https://github.com/${context.repository}/releases/download/${tag}/${ref.sha256}.${extension}`,
      'Durable report reference is missing or invalid.',
    );
  }
  const expectedPrefix = freshMarkdown.split('\n## Automatic publication\n')[0];
  const parts = actualMarkdown.split('\n## Automatic publication\n');
  requireCheck(
    parts.length === 2 && parts[0].trimEnd() === expectedPrefix.trimEnd(),
    'Committed capture prose differs from the trusted inspection.',
  );
  requireCheck(
    `## Automatic publication\n${parts[1]}`.trim() ===
      `${automaticMarkdown.trim()}\n\n${publication}`,
    'Committed no-op report differs from the preparation artifact.',
  );
}

/** Immediate expected-head merge only; no queued auto-merge or protection bypass. */
export async function mergeNoopReview({
  context,
  report,
  preparedCommit,
  preparedDefinition,
  evidence,
  snapshot,
  refreshBase,
  api,
  publicIndex,
  clock = Date.now,
}) {
  try {
    requireCheck(
      /^[\w.-]+\/[\w.-]+$/.test(context.repository) &&
        /^\d+$/.test(context.runId) &&
        digest.test(context.captureSha256) &&
        commit.test(context.headSha) &&
        commit.test(context.workflowSha) &&
        Number.isSafeInteger(context.prNumber) &&
        context.prNumber > 0 &&
        context.ref === `refs/heads/${context.baseBranch}` &&
        ['workflow_dispatch', 'repository_dispatch'].includes(
          context.eventName,
        ),
      'Invalid trusted workflow context.',
    );
    const prefix = `gtfs-review/${context.captureSha256}`;
    requireCheck(
      context.branch === prefix ||
        new RegExp(`^${prefix}-\\d+-\\d+$`).test(context.branch),
      'Unexpected review branch.',
    );
    const preparation = validateNoopPreparation(report, context, clock());
    requireCheck(
      preparedCommit === context.workflowSha &&
        snapshot.baseSha === preparedCommit &&
        snapshot.definitionIdentity === preparedDefinition,
      'Main or its desired definition changed since preparation.',
    );
    requireCheck(snapshot.headSha === context.headSha, 'Review head changed.');
    const allowed = new Set([
      `docs/gtfs/captures/${context.captureSha256}.md`,
      `docs/gtfs/captures/${context.captureSha256}.json`,
    ]);
    requireCheck(
      snapshot.files.length > 0 &&
        snapshot.files.length <= 2 &&
        new Set(snapshot.files.map(({ path }) => path)).size ===
          snapshot.files.length &&
        snapshot.files.every(
          ({ path, status, mode }) =>
            allowed.has(path) &&
            ['A', 'M'].includes(status) &&
            mode === '100644',
        ),
      'The PR contains changes outside its capture evidence.',
    );
    validateNoopEvidence(evidence, context);
    const prPath = `/repos/${context.repository}/pulls/${context.prNumber}`;
    // The PR API may retain its original base.sha. Live main is checked via Git.
    const checkPr = (pr) => {
      requireCheck(
        pr.state === 'open' &&
          !pr.draft &&
          pr.user?.login === 'github-actions[bot]' &&
          pr.head?.sha === context.headSha &&
          pr.head.ref === context.branch &&
          pr.head.repo?.full_name === context.repository &&
          pr.base?.ref === context.baseBranch &&
          pr.base.repo?.full_name === context.repository &&
          pr.changed_files === snapshot.files.length,
        'PR identity or scope changed.',
      );
      requireCheck(!pr.auto_merge, 'A queued merge request already exists.');
      requireCheck(
        !pr.requested_reviewers?.length && !pr.requested_teams?.length,
        'A maintainer requested manual review.',
      );
    };
    checkPr(await api(prPath));
    const reviewsPath = `${prPath}/reviews?per_page=100`;
    const checkReviews = (reviews) =>
      requireCheck(
        reviews.length < 100 &&
          !reviews.some((review) => review.state === 'CHANGES_REQUESTED'),
        'A review requires maintainer attention.',
      );
    checkReviews(await api(reviewsPath));
    const checks = await api(
      `/repos/${context.repository}/commits/${context.headSha}/check-runs?per_page=100`,
    );
    const statuses = await api(
      `/repos/${context.repository}/commits/${context.headSha}/status?per_page=100`,
    );
    requireCheck(
      checks.total_count === checks.check_runs?.length &&
        checks.check_runs.every(
          (check) =>
            check.status === 'completed' &&
            ['success', 'neutral', 'skipped'].includes(check.conclusion),
        ),
      'A head check is pending, failed or incomplete.',
    );
    requireCheck(
      statuses.total_count === statuses.statuses?.length &&
        statuses.statuses.every((status) => status.state === 'success'),
      'A head status is pending, failed or incomplete.',
    );
    requireCheck(
      isDeepStrictEqual(await publicIndex(), preparation.baselineReleaseIndex),
      'The published baseline changed.',
    );
    requireCheck(
      (await refreshBase()) === preparedCommit,
      'Main advanced before merging; prepare this capture again.',
    );
    // GitHub only atomically guards the head; refresh manual-review signals last.
    checkReviews(await api(reviewsPath));
    checkPr(await api(prPath));
    validateNoopPreparation(report, context, clock());
    const result = await api(`${prPath}/merge`, {
      sha: context.headSha,
      merge_method: 'squash',
      commit_title: `chore(gtfs): retain no-op capture ${context.captureSha256.slice(0, 12)}`,
      commit_message: `Verified evidence only; preserve the published timetable and history.\n\nInspection: https://github.com/${context.repository}/actions/runs/${context.runId}\n\nCo-Authored-By: Codex <noreply@openai.com>`,
    });
    return {
      merged: result.merged === true,
      reason: result.message ?? 'GitHub did not merge the PR.',
    };
  } catch (error) {
    if (error instanceof Ineligible)
      return { merged: false, reason: error.message };
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const env = process.env;
  const repository = env.GITHUB_REPOSITORY;
  const prUrl = new URL(env.REVIEW_PR_URL);
  if (
    prUrl.origin !== 'https://github.com' ||
    prUrl.pathname !==
      `/${repository}/pull/${prUrl.pathname.split('/').at(-1)}` ||
    !/^\d+$/.test(prUrl.pathname.split('/').at(-1))
  )
    throw new Error('Unexpected review PR URL');
  const context = {
    repository,
    prNumber: Number(prUrl.pathname.split('/').at(-1)),
    runId: env.GITHUB_RUN_ID,
    workflowSha: env.GITHUB_SHA,
    headSha: env.REVIEW_HEAD_SHA,
    branch: env.REVIEW_BRANCH,
    baseBranch: env.BASE_BRANCH,
    captureSha256: env.SNAPSHOT_SHA256,
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
  };
  if (
    !commit.test(context.headSha) ||
    !digest.test(context.captureSha256) ||
    !/^[\w./-]+$/.test(context.baseBranch) ||
    context.baseBranch.startsWith('-')
  )
    throw new Error('Invalid git ref');
  const git = (...args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  const refreshBase = async () => {
    git('fetch', 'origin', context.baseBranch);
    return git('rev-parse', 'FETCH_HEAD');
  };
  const baseSha = await refreshBase();
  git('fetch', 'origin', context.headSha);
  const headSha = git('rev-parse', 'FETCH_HEAD');
  const entry = git('ls-tree', baseSha, '--', 'releases/gtfs.json');
  const changes = git(
    'diff',
    '--no-renames',
    '--name-status',
    `${baseSha}...${headSha}`,
  )
    .split('\n')
    .filter(Boolean);
  const files = changes.map((line) => {
    const [status, path] = line.split('\t');
    return {
      status,
      path,
      mode: git('ls-tree', headSha, '--', path).split(' ')[0],
    };
  });
  const prefix = `docs/gtfs/captures/${context.captureSha256}`;
  // Preserve blob bytes for size checks; trimming could hide oversized whitespace.
  const read = (suffix) =>
    execFileSync('git', ['show', `${headSha}:${prefix}.${suffix}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const automatic = join(env.RUNNER_TEMP, 'gtfs-automatic');
  const fresh = join(
    env.RUNNER_TEMP,
    'gtfs-capture-receipt',
    context.captureSha256,
  );
  const api = async (path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method: body ? 'PUT' : 'GET',
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (body && [403, 405, 409, 422].includes(response.status))
      return {
        merged: false,
        message: `GitHub declined the merge (${response.status}); leave the PR open.`,
      };
    if (!response.ok) throw new Error(`GitHub API failed (${response.status})`);
    return response.json();
  };
  const result = await mergeNoopReview({
    context,
    report: await json(join(automatic, 'automatic-publication.json')),
    preparedCommit: (
      await readFile(join(automatic, 'preparation-commit.txt'), 'utf8')
    ).trim(),
    preparedDefinition: (
      await readFile(join(automatic, 'preparation-base.txt'), 'utf8')
    ).trim(),
    evidence: {
      actualJson: read('json'),
      actualMarkdown: read('md'),
      freshJson: await json(`${fresh}.json`),
      freshMarkdown: await readFile(`${fresh}.md`, 'utf8'),
      automaticMarkdown: await readFile(
        join(automatic, 'automatic-publication.md'),
        'utf8',
      ),
    },
    snapshot: {
      baseSha,
      headSha,
      definitionIdentity: entry ? entry.split(/\s+/)[2] : 'absent',
      files,
    },
    refreshBase,
    api,
    publicIndex: async () => {
      const response = await fetch(
        'https://data.mrtdown.org/combined-timetable-release-index.json',
        {
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          cache: 'no-store',
        },
      );
      if (!response.ok)
        throw new Error(`Cannot verify public baseline (${response.status})`);
      return response.json();
    },
  });
  const summary = `GTFS no-op evidence ${result.merged ? 'merged' : 'left open'}: ${result.reason}`;
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
