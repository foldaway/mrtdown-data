import { constants } from 'node:fs';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readIssueBundle } from '@mrtdown/fs';
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
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(import.meta.dirname, '../../../../../fixtures/generated/data'),
);
const CROWD_REPORT_FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/ingest/crowd-report.json',
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

  test('creates canonical public-report evidence from an accepted crowd report', async () => {
    mocks.triageNewEvidence.mockResolvedValue({
      result: { kind: 'part-of-new-issue', issueType: 'disruption' },
    });
    mocks.extractClaimsFromNewEvidence.mockResolvedValue({
      claims: [
        {
          entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
          effect: {
            service: { kind: 'delay', duration: 'PT15M' },
            facility: null,
          },
          scopes: {
            service: [{ type: 'service.point', stationId: 'BCL' }],
          },
          statusSignal: 'open',
          timeHints: {
            kind: 'start-only',
            startAt: '2026-05-23T09:03:00+08:00',
          },
          causes: ['delay'],
        },
      ],
    });
    mocks.generateIssueTitleAndSlug.mockResolvedValue({
      title: 'Downtown Line delay near Beauty World',
      slug: 'downtown-line-delay-near-beauty-world',
    });
    mocks.translate.mockImplementation(async (text: string) => ({
      'en-SG': text,
      'zh-Hans': null,
      ms: null,
      ta: null,
    }));

    const fixture = JSON.parse(
      await readFile(CROWD_REPORT_FIXTURE, 'utf8'),
    ) as {
      content: [IngestContent];
    };
    const [content] = fixture.content;

    await ingestContent(content, { dataDir });

    const issueId = '2026-05-23-downtown-line-delay-near-beauty-world';
    const bundle = await readIssueBundle(dataDir, issueId);

    expect(bundle.issue).toMatchObject({
      id: issueId,
      type: 'disruption',
      title: {
        'en-SG': 'Downtown Line delay near Beauty World',
      },
      titleMeta: {
        source: '@openai/gpt-5.4-nano',
      },
    });
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toMatchObject({
      type: 'report.public',
      sourceUrl:
        'https://www.mrtdown.org/crowd-reports/accepted-20260523-0903-dtl-001',
      text: [
        'Report: Several commuters report 15 minute delays on the DTL.',
        'Observed at: 2026-05-23T09:03:00+08:00',
        'Accepted at: 2026-05-23T09:04:00.000+08:00',
        'Lines: DTL',
        'Stations: BCL',
        'Direction: towards Expo',
        'Effect: delay',
        'Delay minutes: 15',
        'Report count: 4',
      ].join('\n\n'),
      render: {
        source: '@openai/gpt-5.4-nano',
      },
    });
    expect(bundle.impactEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'service_effects.set',
          entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
          effect: { kind: 'delay', duration: 'PT15M' },
        }),
        expect.objectContaining({
          type: 'periods.set',
          entity: { type: 'service', serviceId: 'DTL_MAIN_E' },
          periods: [
            {
              kind: 'fixed',
              startAt: '2026-05-23T09:03:00+08:00',
              endAt: null,
            },
          ],
        }),
      ]),
    );
  });
});

async function expectPathMissing(path: string) {
  await expect(access(path, constants.F_OK)).rejects.toThrow();
}
