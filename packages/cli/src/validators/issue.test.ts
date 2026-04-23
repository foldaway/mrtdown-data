import test from 'node:test';
import assert from 'node:assert/strict';
import type { IStore } from '@mrtdown/fs';
import { validateIssue } from './issue.js';

class MockStore implements IStore {
  constructor(
    private readonly textFiles: Map<string, string>,
    private readonly jsonFiles: Map<string, unknown>,
  ) {}

  readText(path: string): string {
    const value = this.textFiles.get(path);
    if (value == null) {
      const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return value;
  }

  readJson<T>(path: string): T {
    const value = this.jsonFiles.get(path);
    if (value == null) {
      const error = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return value as T;
  }

  listDir(_path: string): string[] {
    return [];
  }

  exists(path: string): boolean {
    return this.textFiles.has(path) || this.jsonFiles.has(path);
  }
}

test('validateIssue flags issues with evidence but zero impact events', () => {
  const relBase = 'issue/2026/04/2026-04-01-test';
  const store = new MockStore(
    new Map([
      [
        `${relBase}/evidence.ndjson`,
        '{"id":"ev_1","ts":"2025-07-30T19:03:02.000+08:00","type":"official-statement","text":"Bukit Panjang LRT line will be closed on Aug 31.","sourceUrl":"https://example.com","render":null}\n',
      ],
      [`${relBase}/impact.ndjson`, ''],
    ]),
    new Map([
      [
        `${relBase}/issue.json`,
        {
          id: '2026-04-01-test',
          type: 'infra',
          title: {
            'en-SG': 'Test issue',
            'zh-Hans': null,
            ms: null,
            ta: null,
          },
          titleMeta: {
            source: 'test',
          },
        },
      ],
    ]),
  );

  const errors = validateIssue(store, relBase);

  assert.deepEqual(errors, [
    {
      file: `${relBase}/impact.ndjson`,
      message: 'issue has evidence but no impact events',
    },
  ]);
});
