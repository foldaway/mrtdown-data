import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import { describe, expect, test } from 'vitest';
import { FindServicesTool } from './FindServicesTool.js';

describe('FindServicesTool', () => {
  test('returns only services active at the evidence timestamp', async () => {
    const service = (id: string, endAt: string | null) => ({
      id,
      lineId: 'BPLRT',
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
    const repo = {
      services: {
        searchByLineId: () => [
          service('BPLRT_A', null),
          service('BPLRT_B', null),
          service('BPLRT_C', '2019-01-13'),
        ],
      },
    } as unknown as MRTDownRepository;
    const evidenceTs = DateTime.fromISO('2026-05-18T06:04:54+08:00', {
      setZone: true,
    });
    const tool = new FindServicesTool(evidenceTs, repo);

    const output = await tool.runner({ lineId: 'BPLRT' });

    expect(tool.description).toContain('active at the evidence timestamp');
    expect(output).toContain('BPLRT\\_A');
    expect(output).toContain('BPLRT\\_B');
    expect(output).not.toContain('BPLRT\\_C');
  });
});
