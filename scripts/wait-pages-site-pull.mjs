import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

/** A queued request, a different run, or a successful unrelated import is insufficient. */
export async function waitForSitePull({
  url,
  token,
  workflowRunId,
  expectedIndex,
  fetcher = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  attempts = 360,
  timeoutMs = 60 * 60 * 1000,
  now = Date.now,
}) {
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    !workflowRunId
  )
    throw new Error('Expected an HTTPS task URL and a workflow run ID');
  endpoint.searchParams.set('workflowRunId', workflowRunId);
  const deadline = now() + timeoutMs;
  const pause = () => sleep(Math.max(0, Math.min(10000, deadline - now())));
  for (let attempt = 0; attempt < attempts && now() < deadline; attempt++) {
    let response;
    let status;
    try {
      response = await fetcher(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(10000, deadline - now())),
        ),
      });
      if (response.ok) status = await response.json();
    } catch (error) {
      if (
        !(error instanceof TypeError) &&
        !['AbortError', 'TimeoutError'].includes(error?.name)
      )
        throw error;
      // A transport timeout says nothing about the running import. Consume a
      // bounded polling attempt; never accept it as a completion receipt.
    }
    if (
      response &&
      !response.ok &&
      ![429, 500, 502, 503, 504].includes(response.status)
    )
      throw new Error(`Site import status returned HTTP ${response.status}`);
    if (status === undefined) {
      if (attempt + 1 < attempts) await pause();
      continue;
    }
    if (!status || typeof status !== 'object' || Array.isArray(status))
      throw new Error('Malformed site import status');
    if (status.workflowRunId !== workflowRunId)
      throw new Error('Site returned a different workflow run');
    if (['RUN_FAILED', 'RUN_CANCELED'].includes(status.state))
      throw new Error(`Site import ${status.state}`);
    if (status.state === 'RUN_SUCCESS') {
      if (
        !isDeepStrictEqual(status.combinedReleaseIndex, expectedIndex ?? null)
      )
        throw new Error(
          'Completed site import does not identify the published release',
        );
      return status;
    }
    if (!['RUN_STARTED', 'PENDING'].includes(status.state))
      throw new Error('Unknown site import status');
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error(
    'Timed out waiting for the site import to complete; the approved baseline was not advanced',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [responsePath, payloadPath] = process.argv.slice(2);
  const env = process.env;
  if (responsePath === '--preflight') {
    // An unknown run should be pending. This also checks authentication and that
    // the completion endpoint was deployed before any new public bytes change.
    const url = new URL(env.MRTDOWN_SITE_PULL_URL);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Expected an HTTPS task URL');
    const id = 'mrtdown-data-status-preflight';
    url.searchParams.set('workflowRunId', id);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.MRTDOWN_SITE_INTERNAL_API_TOKEN}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        'The authenticated site completion endpoint is not ready',
      );
    const receipt = await response.json();
    if (receipt.workflowRunId !== id || receipt.state !== 'PENDING')
      throw new Error('Unexpected site completion preflight response');
    process.exit(0);
  }
  const response = JSON.parse(await readFile(responsePath, 'utf8'));
  const payload = payloadPath
    ? JSON.parse(await readFile(payloadPath, 'utf8'))
    : {};
  await waitForSitePull({
    url: env.MRTDOWN_SITE_PULL_URL,
    token: env.MRTDOWN_SITE_INTERNAL_API_TOKEN,
    workflowRunId: response.workflowRunId,
    expectedIndex: payload.combinedReleaseIndex,
  });
  console.log('The site finished importing the exact published release.');
}
