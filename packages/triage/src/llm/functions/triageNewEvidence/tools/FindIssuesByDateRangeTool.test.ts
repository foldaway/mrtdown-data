import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { describe, expect, test } from 'vitest';
import { FindIssuesByDateRangeTool } from './FindIssuesByDateRangeTool.js';

const FIXTURE_DATA_DIR = resolve(
  process.env.MRTDOWN_FIXTURE_DATA_DIR ??
    resolve(
      import.meta.dirname,
      '../../../../../../../fixtures/generated/data',
    ),
);
const FIXTURE_META = JSON.parse(
  readFileSync(
    process.env.MRTDOWN_FIXTURE_META_PATH ??
      resolve(
        import.meta.dirname,
        '../../../../../../../fixtures/generated/meta.json',
      ),
    'utf8',
  ),
) as {
  issues: {
    trainFault: {
      id: string;
      date: string;
      timestamp: string;
      title: string;
      serviceIds: string[];
    };
    signalFault: { id: string };
    lateOpenings: {
      id: string;
      scheduledTimestamp: string;
      betweenOccurrencesTimestamp: string;
    };
  };
};

describe('FindIssuesByDateRangeTool', () => {
  test('finds issues by issue date, evidence timestamp, and active periods', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const output = await tool.runner({
      startAt: FIXTURE_META.issues.trainFault.date,
      endAt: FIXTURE_META.issues.trainFault.date,
    });

    expect(output).toContain(FIXTURE_META.issues.trainFault.id);
    expect(output).toContain(FIXTURE_META.issues.trainFault.title);
    expect(output).toContain(
      FIXTURE_META.issues.trainFault.serviceIds[0]?.replaceAll('_', '\\_'),
    );
    expect(output).not.toContain(FIXTURE_META.issues.signalFault.id);
  });

  test('treats an exact end datetime as part of the search window', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const output = await tool.runner({
      startAt: FIXTURE_META.issues.trainFault.timestamp,
      endAt: FIXTURE_META.issues.trainFault.timestamp,
    });

    expect(output).toContain(FIXTURE_META.issues.trainFault.id);
    expect(output).toContain('evidence timestamp');
    expect(output).toContain(FIXTURE_META.issues.trainFault.timestamp);
  });

  test('matches recurring periods only during scheduled occurrences', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const scheduledOutput = await tool.runner({
      startAt: FIXTURE_META.issues.lateOpenings.scheduledTimestamp,
      endAt: FIXTURE_META.issues.lateOpenings.scheduledTimestamp,
    });
    const betweenOccurrencesOutput = await tool.runner({
      startAt: FIXTURE_META.issues.lateOpenings.betweenOccurrencesTimestamp,
      endAt: FIXTURE_META.issues.lateOpenings.betweenOccurrencesTimestamp,
    });

    expect(scheduledOutput).toContain(FIXTURE_META.issues.lateOpenings.id);
    expect(scheduledOutput).toContain('active period');
    expect(betweenOccurrencesOutput).not.toContain(
      FIXTURE_META.issues.lateOpenings.id,
    );
  });

  test('reports when no issues overlap the date range', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    await expect(
      tool.runner({
        startAt: '2025-01-01',
        endAt: '2025-01-01',
      }),
    ).resolves.toBe('No issues found in date range.');
  });
});
