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
  it('accepts first and last train services with nullable halves', () => {
    expect(() =>
      StationSchema.parse({
        ...minimalStation(),
        firstLastTrain: {
          services: [
            {
              serviceId: 'ISL_MAIN_E',
              times: {
                weekday: {
                  firstTrain: '06:00',
                  lastTrain: '00:50',
                },
                saturday: {
                  firstTrain: '06:05',
                  lastTrain: null,
                },
              },
              specialTimes: {
                eve_public_holiday: {
                  firstTrain: null,
                  lastTrain: '01:05',
                },
              },
            },
            {
              serviceId: 'ISL_MAIN_W',
              times: {
                weekday: {
                  firstTrain: null,
                  lastTrain: '00:35',
                },
              },
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
        services: [
          {
            serviceId: 'ISL_MAIN_E',
            times: {
              weekday: {
                firstTrain: null,
                lastTrain: null,
              },
            },
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
        services: [
          {
            serviceId: 'ISL_MAIN_E',
            times: {
              holiday: {
                firstTrain: '25:00',
                lastTrain: '00:50',
              },
            },
            specialTimes: {
              school_holiday: {
                firstTrain: null,
                lastTrain: '00:55',
              },
            },
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining([
        'firstLastTrain.services.0.times.holiday',
        'firstLastTrain.services.0.specialTimes.school_holiday',
      ]),
    );
  });

  it('accepts station layout data', () => {
    expect(() =>
      StationSchema.parse({
        ...minimalStation(),
        layout: {
          levels: [
            {
              id: 'B2',
              index: -2,
              name: {
                'en-SG': 'Platforms',
                'zh-Hans': null,
                ms: null,
                ta: null,
              },
            },
          ],
          exits: [
            {
              id: 'KET_EXIT_A',
              label: 'A',
              levelId: 'B2',
              paidArea: false,
            },
          ],
          platforms: [
            {
              id: 'KET_ISL_A',
              label: 'A',
              lineId: 'ISL',
              levelId: 'B2',
              serviceIds: ['ISL_MAIN_E'],
              doorCount: 24,
              accessPoints: [
                {
                  id: 'KET_ISL_A_ESC_01',
                  kind: 'escalator',
                  nearestDoor: '12',
                  position: 'middle',
                  connectsToLevelId: 'B2',
                  direction: 'up',
                },
              ],
            },
          ],
          transferPaths: [
            {
              id: 'KET_TRANSFER',
              from: {
                kind: 'platform',
                id: 'KET_ISL_A',
              },
              to: {
                kind: 'level',
                id: 'B2',
              },
              paidArea: true,
              modes: ['walk', 'escalator'],
              levelChange: 0,
              classification: 'short',
              estimatedTraversalSeconds: null,
              distanceMeters: null,
            },
          ],
        },
      }),
    ).not.toThrow();
  });
});
