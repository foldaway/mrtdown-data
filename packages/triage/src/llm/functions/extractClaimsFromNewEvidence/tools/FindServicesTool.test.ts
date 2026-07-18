import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import { describe, expect, test } from 'vitest';
import { FindServicesTool } from './FindServicesTool.js';

describe('FindServicesTool', () => {
  test('returns active services for multiple lines in one call', async () => {
    const service = (id: string, lineId: string, endAt: string | null) => ({
      id,
      lineId,
      name: { 'en-SG': id },
      revisions: [
        {
          startAt: '1999-11-06',
          endAt,
          path: {
            stations: [
              { stationId: 'SNJ', displayCode: 'BP13' },
              { stationId: 'PTR', displayCode: 'BP7' },
            ],
          },
          operatingHours: {
            weekdays: { start: '05:00', end: '00:55' },
            weekends: { start: '05:00', end: '00:55' },
          },
        },
      ],
    });
    const servicesByLineId = {
      BPLRT: [
        service('BPLRT_A', 'BPLRT', null),
        service('BPLRT_B', 'BPLRT', null),
        service('BPLRT_C', 'BPLRT', '2019-01-13'),
      ],
      CCL: [service('CCL_MAIN_CW', 'CCL', null)],
    };
    const searchedLineIds: string[] = [];
    const repo = {
      services: {
        searchByLineId: (lineId: keyof typeof servicesByLineId) => {
          searchedLineIds.push(lineId);
          return servicesByLineId[lineId];
        },
      },
    } as unknown as MRTDownRepository;
    const evidenceTs = DateTime.fromISO('2026-05-18T06:04:54+08:00', {
      setZone: true,
    });
    const tool = new FindServicesTool(evidenceTs, repo);

    expect(() => tool.parseParams({ lineIds: [] })).toThrow();

    const output = await tool.runner({
      lineIds: ['BPLRT', 'CCL', 'BPLRT'],
    });

    expect(tool.description).toContain('active at the evidence timestamp');
    expect(searchedLineIds).toEqual(['BPLRT', 'CCL']);
    expect(output).toContain('BPLRT\\_A');
    expect(output).toContain('BPLRT\\_B');
    expect(output).not.toContain('BPLRT\\_C');
    expect(output).toContain('CCL\\_MAIN\\_CW');
  });
});
