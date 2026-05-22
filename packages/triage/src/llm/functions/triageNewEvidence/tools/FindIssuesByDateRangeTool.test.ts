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
