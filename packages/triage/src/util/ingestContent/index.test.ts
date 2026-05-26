import { constants } from 'node:fs';
import { access, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { IngestContent } from '@mrtdown/ingest-contracts';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ingestContent } from './index.js';

const mocks = vi.hoisted(() => ({
  extractClaimsFromNewEvidence: vi.fn(),
  generateIssueTitleAndSlug: vi.fn(),
  translate: vi.fn(),
  triageNewEvidence: vi.fn(),
}));

vi.mock('../../llm/functions/extractClaimsFromNewEvidence/index.js', () => ({
  extractClaimsFromNewEvidence: mocks.extractClaimsFromNewEvidence,
}));

vi.mock('../../llm/functions/generateIssueTitleAndSlug/index.js', () => ({
  generateIssueTitleAndSlug: mocks.generateIssueTitleAndSlug,
}));

vi.mock('../../llm/functions/translate/index.js', () => ({
  translate: mocks.translate,
}));

vi.mock('../../llm/functions/triageNewEvidence/index.js', () => ({
  triageNewEvidence: mocks.triageNewEvidence,
}));

const FIXTURE_DATA_DIR = resolve(
  import.meta.dirname,
  '../../../../../fixtures/data',
);

describe('ingestContent', () => {
  let dataDir: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    dataDir = await mkdtemp(join(tmpdir(), 'mrtdown-ingest-'));
    await cp(FIXTURE_DATA_DIR, dataDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
  });

  test('does not create a new issue when extraction produces no impact claims', async () => {
    mocks.triageNewEvidence.mockResolvedValue({
      result: { kind: 'part-of-new-issue', issueType: 'disruption' },
    });
    mocks.extractClaimsFromNewEvidence.mockResolvedValue({ claims: [] });

    const content: IngestContent = {
      source: 'mastodon',
      accountName: 'LTA Train Service Alerts',
      text: '14:23-Due to vehicle breakdown along Sims Avenue East, at the junction with Chai Chee Drive after bus stop BS 83081, bus service 26 is diverted.',
      url: 'https://mastodon.social/@ltatrainservicealerts/116639539143966503',
      createdAt: '2026-05-26T14:48:44.000+08:00',
    };

    await ingestContent(content, { dataDir });

    expect(mocks.extractClaimsFromNewEvidence).toHaveBeenCalledOnce();
    expect(mocks.generateIssueTitleAndSlug).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
    await expectPathMissing(
      join(
        dataDir,
        'issue/2026/05/2026-05-26-bus-service-26-vehicle-breakdown-sims-avenue-east-chai-chee-drive-bs-83081',
      ),
    );
  });
});

async function expectPathMissing(path: string) {
  await expect(access(path, constants.F_OK)).rejects.toThrow();
}
