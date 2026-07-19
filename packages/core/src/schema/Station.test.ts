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
        startedAt: '1979-10-01',
        endedAt: null,
        structureType: 'underground',
      },
    ],
    landmarkIds: [],
    townId: 'central-western',
  };
}

describe('StationSchema', () => {
  it('requires date-only station code boundaries', () => {
    const station = minimalStation();
    station.stationCodes[0].startedAt = '1979-10-01T00:00:00+08:00';

    expect(StationSchema.safeParse(station).success).toBe(false);
  });

  it('accepts station discovery metadata', () => {
    expect(() =>
      StationSchema.parse({
        ...minimalStation(),
        address: {
          streetAddress: '20 Tampines Central 1',
          postalCode: '529538',
          addressLocality: 'Singapore',
          addressCountry: 'SG',
        },
        aliases: ['Tampines MRT', 'Tampines MRT Station', 'EW2', 'DT32'],
      }),
    ).not.toThrow();
    expect(() =>
      StationSchema.parse({
        ...minimalStation(),
        address: {
          addressCountry: 'US',
        },
      }),
    ).not.toThrow();
  });

  it('rejects invalid station discovery metadata', () => {
    const result = StationSchema.safeParse({
      ...minimalStation(),
      address: {
        addressCountry: 'ZZ',
      },
      aliases: ['   '],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['address.addressCountry', 'aliases.0']),
    );
  });

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
          sourceId: 'lta-mrt-station-exit-geojson',
          exits: [
            {
              sourceObjectId: 21404,
              sourceChecksum: '122980157DCB57C6',
              label: 'A',
              lastUpdated: '2025-12-02',
              geo: {
                latitude: 1.3987872483653485,
                longitude: 103.81800341495403,
              },
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects unsupported station layout fields', () => {
    const result = StationSchema.safeParse({
      ...minimalStation(),
      layout: {
        sourceId: 'lta-mrt-station-exit-geojson',
        exits: [
          {
            sourceObjectId: 21404,
            sourceChecksum: '122980157DCB57C6',
            label: 'A',
            lastUpdated: '2025-12-02',
            geo: {
              latitude: 1.3987872483653485,
              longitude: 103.81800341495403,
            },
            roadNames: ['Unsupported Road'],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.join('.')).toBe('layout.exits.0');
  });

  it('rejects station layouts from unregistered sources', () => {
    const result = StationSchema.safeParse({
      ...minimalStation(),
      layout: {
        sourceId: 'smrt-journey',
        exits: [
          {
            sourceObjectId: 21404,
            sourceChecksum: '122980157DCB57C6',
            label: 'A',
            lastUpdated: '2025-12-02',
            geo: {
              latitude: 1.3987872483653485,
              longitude: 103.81800341495403,
            },
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.join('.')).toBe('layout.sourceId');
  });
});
