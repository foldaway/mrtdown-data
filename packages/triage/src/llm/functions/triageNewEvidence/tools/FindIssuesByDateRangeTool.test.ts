import { resolve } from 'node:path';
import { FileStore, MRTDownRepository } from '@mrtdown/fs';
import { describe, expect, test } from 'vitest';
import { FindIssuesByDateRangeTool } from './FindIssuesByDateRangeTool.js';

const FIXTURE_DATA_DIR = resolve(
  import.meta.dirname,
  '../../../../../../../fixtures/data',
);

describe('FindIssuesByDateRangeTool', () => {
  test('finds issues by issue date, evidence timestamp, and active periods', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const output = await tool.runner({
      startAt: '2026-01-01',
      endAt: '2026-01-01',
    });

    expect(output).toContain('2026-01-01-btl-train-fault');
    expect(output).toContain('Bukit Timah Line Train Fault');
    expect(output).toContain('BTL\\_MAIN\\_E');
    expect(output).not.toContain('2027-01-15-erl-signal-fault');
  });

  test('treats an exact end datetime as part of the search window', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const output = await tool.runner({
      startAt: '2026-01-01T07:00:00+08:00',
      endAt: '2026-01-01T07:00:00+08:00',
    });

    expect(output).toContain('2026-01-01-btl-train-fault');
    expect(output).toContain('evidence timestamp');
    expect(output).toContain('2026-01-01T07:00:00+08:00');
  });

  test('matches recurring periods only during scheduled occurrences', async () => {
    const repo = new MRTDownRepository({
      store: new FileStore(FIXTURE_DATA_DIR),
    });
    const tool = new FindIssuesByDateRangeTool(repo);

    const scheduledOutput = await tool.runner({
      startAt: '2027-08-22T09:00:00+08:00',
      endAt: '2027-08-22T09:00:00+08:00',
    });
    const betweenOccurrencesOutput = await tool.runner({
      startAt: '2027-08-25T09:00:00+08:00',
      endAt: '2027-08-25T09:00:00+08:00',
    });

    expect(scheduledOutput).toContain('2027-08-21-btl-weekend-late-openings');
    expect(scheduledOutput).toContain('active period');
    expect(betweenOccurrencesOutput).not.toContain(
      '2027-08-21-btl-weekend-late-openings',
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
