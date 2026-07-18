import type { MRTDownRepository } from '@mrtdown/fs';
import { describe, expect, test } from 'vitest';
import { FindLinesTool } from './FindLinesTool.js';

describe('FindLinesTool', () => {
  test('lists all lines without requiring the model to name them', async () => {
    const searchedNames: string[][] = [];
    const repo = {
      lines: {
        list: () => [
          { id: 'CCL', name: { 'en-SG': 'Circle Line' } },
          { id: 'BPLRT', name: { 'en-SG': 'Bukit Panjang LRT' } },
        ],
        searchByName: (lineNames: string[]) => {
          searchedNames.push(lineNames);
          return [];
        },
      },
    } as unknown as MRTDownRepository;
    const tool = new FindLinesTool(repo);

    const output = await tool.runner({ lineNames: [], listAll: true });

    expect(tool.description).toContain('list all lines');
    expect(searchedNames).toEqual([]);
    expect(output).toContain('CCL');
    expect(output).toContain('BPLRT');
  });

  test('searches by name when listAll is false', async () => {
    const searchedNames: string[][] = [];
    const repo = {
      lines: {
        list: () => [],
        searchByName: (lineNames: string[]) => {
          searchedNames.push(lineNames);
          return [{ id: 'CCL', name: { 'en-SG': 'Circle Line' } }];
        },
      },
    } as unknown as MRTDownRepository;
    const tool = new FindLinesTool(repo);

    const output = await tool.runner({
      lineNames: ['Circle Line'],
      listAll: false,
    });

    expect(searchedNames).toEqual([['Circle Line']]);
    expect(output).toContain('CCL');
  });
});
