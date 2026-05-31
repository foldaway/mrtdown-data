import { describe, expect, it } from 'vitest';
import { StationSchema } from './Station.js';

function minimalStation() {
  return {
    id: 'KET',
    name: {
      'en-SG': 'Kennedy Town',
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    geo: {
      latitude: 22.2813,
      longitude: 114.1286,
    },
    stationCodes: [
      {
        lineId: 'ISL',
        code: 'ISL1',
        startedAt: '1979-10-01T00:00:00Z',
        endedAt: null,
        structureType: 'underground',
      },
    ],
    landmarkIds: [],
    townId: 'central-western',
  };
}

describe('StationSchema', () => {
  it('accepts first and last train entries with nullable halves', () => {
    expect(() =>
      StationSchema.parse({
        ...minimalStation(),
        firstLastTrain: {
          entries: [
            {
              serviceId: 'ISL_MAIN_E',
              calendar: 'weekday',
              firstTrain: '06:00',
              lastTrain: '00:50',
            },
            {
              serviceId: 'ISL_MAIN_E',
              calendar: 'saturday',
              firstTrain: '06:05',
              lastTrain: null,
            },
            {
              serviceId: 'ISL_MAIN_W',
              calendar: 'weekday',
              firstTrain: null,
              lastTrain: '00:35',
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects timing rows without a first or last train time', () => {
    const result = StationSchema.safeParse({
      ...minimalStation(),
      firstLastTrain: {
        entries: [
          {
            serviceId: 'ISL_MAIN_E',
            calendar: 'weekday',
            firstTrain: null,
            lastTrain: null,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'At least one of firstTrain or lastTrain must be set',
    );
  });

  it('rejects invalid timing clocks and calendar categories', () => {
    const result = StationSchema.safeParse({
      ...minimalStation(),
      firstLastTrain: {
        entries: [
          {
            serviceId: 'ISL_MAIN_E',
            calendar: 'holiday',
            firstTrain: '25:00',
            lastTrain: '00:50',
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining([
        'firstLastTrain.entries.0.calendar',
        'firstLastTrain.entries.0.firstTrain',
      ]),
    );
  });
});
