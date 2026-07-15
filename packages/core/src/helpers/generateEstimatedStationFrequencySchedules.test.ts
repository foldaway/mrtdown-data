import { describe, expect, test } from 'vitest';
import {
  type EstimatedFrequencyProfile,
  EstimatedFrequencyProfileSchema,
  type ServiceRevision,
} from '../schema/Service.js';
import type { Station } from '../schema/Station.js';
import {
  enumerateEstimatedStationDepartures,
  generateEstimatedServiceStationFrequencySchedules,
  generateEstimatedStationFrequencySchedule,
} from './generateEstimatedStationFrequencySchedules.js';

const estimatedFrequency = {
  source: {
    url: 'https://www.lta.gov.sg/example',
    description: 'LTA system-wide train frequency guidance',
    retrievedAt: '2026-07-16',
  },
  defaultHeadway: {
    minSeconds: 300,
    maxSeconds: 420,
    representativeSeconds: 360,
  },
  periods: [
    {
      id: 'weekday_morning_peak',
      dayType: 'weekdays',
      start: '07:00',
      end: '09:00',
      headway: {
        minSeconds: 120,
        maxSeconds: 180,
        representativeSeconds: 150,
      },
    },
  ],
} satisfies EstimatedFrequencyProfile;

const revision = {
  path: {
    stations: [
      { stationId: 'HBF', displayCode: 'NE1' },
      { stationId: 'SKG', displayCode: 'NE16' },
      { stationId: 'PGC', displayCode: 'NE18' },
    ],
  },
  estimatedFrequency,
} satisfies Pick<ServiceRevision, 'path' | 'estimatedFrequency'>;

function station(
  id: string,
  times?: NonNullable<
    NonNullable<Station['firstLastTrain']>['services'][number]['times']
  >,
): Pick<Station, 'id' | 'firstLastTrain'> {
  return {
    id,
    firstLastTrain: times
      ? { services: [{ serviceId: 'NEL_MAIN_N', times }] }
      : undefined,
  };
}

const harbourFront = station('HBF', {
  weekday: { firstTrain: '05:47', lastTrain: '23:55' },
  saturday: { firstTrain: '05:47', lastTrain: '23:55' },
  sunday_public_holiday: { firstTrain: '06:07', lastTrain: '23:55' },
});

const sengkang = station('SKG', {
  weekday: { firstTrain: '05:33', lastTrain: '00:27' },
  saturday: { firstTrain: '05:33', lastTrain: '00:27' },
  sunday_public_holiday: { firstTrain: '05:53', lastTrain: '00:27' },
});

describe('EstimatedFrequencyProfileSchema', () => {
  test('accepts a representative headway within the published range', () => {
    expect(
      EstimatedFrequencyProfileSchema.safeParse(estimatedFrequency).success,
    ).toBe(true);
  });

  test('rejects a representative headway outside the published range', () => {
    const result = EstimatedFrequencyProfileSchema.safeParse({
      ...estimatedFrequency,
      defaultHeadway: {
        ...estimatedFrequency.defaultHeadway,
        representativeSeconds: 480,
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('generateEstimatedStationFrequencySchedule', () => {
  test('clips weekday windows to HarbourFront timings', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: harbourFront,
      calendar: 'weekday',
    });

    expect(schedule).toMatchObject({
      stationId: 'HBF',
      displayCode: 'NE1',
      stopSequence: 1,
      sourceCalendar: 'weekday',
      firstTrainTime: '05:47',
      lastTrainTime: '23:55',
    });
    expect(schedule.windows).toEqual([
      expect.objectContaining({
        startTime: '05:47:00',
        endTime: '07:00:00',
        headwaySeconds: 360,
        sourcePeriodId: null,
      }),
      expect.objectContaining({
        startTime: '07:00:00',
        endTime: '09:00:00',
        headwaySeconds: 150,
        sourcePeriodId: 'weekday_morning_peak',
      }),
      expect.objectContaining({
        startTime: '09:00:00',
        endTime: '23:55:00',
        headwaySeconds: 360,
        sourcePeriodId: null,
      }),
    ]);
  });

  test('preserves a short starter and an after-midnight last train', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: sengkang,
      calendar: 'weekday',
    });

    expect(schedule.firstTrainTime).toBe('05:33');
    expect(schedule.lastTrainTime).toBe('00:27');
    expect(schedule.windows.at(-1)).toMatchObject({
      startTime: '09:00:00',
      endTime: '24:27:00',
    });
  });

  test('keeps Saturday and Sunday station bounds distinct', () => {
    const saturday = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: harbourFront,
      calendar: 'saturday',
    });
    const sunday = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: harbourFront,
      calendar: 'sunday_public_holiday',
    });

    expect(saturday.firstTrainTime).toBe('05:47');
    expect(saturday.windows).toHaveLength(1);
    expect(sunday.firstTrainTime).toBe('06:07');
    expect(sunday.windows).toHaveLength(1);
  });

  test('falls back to combined and daily source calendars', () => {
    const combined = station('HBF', {
      weekday_saturday: { firstTrain: '05:30', lastTrain: '23:30' },
      daily: { firstTrain: '06:00', lastTrain: '23:00' },
    });

    expect(
      generateEstimatedStationFrequencySchedule({
        serviceId: 'NEL_MAIN_N',
        revision,
        station: combined,
        calendar: 'saturday',
      }).sourceCalendar,
    ).toBe('weekday_saturday');
    expect(
      generateEstimatedStationFrequencySchedule({
        serviceId: 'NEL_MAIN_N',
        revision,
        station: combined,
        calendar: 'sunday_public_holiday',
      }).sourceCalendar,
    ).toBe('daily');
  });

  test('retains path stations without direction-specific timing', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: station('PGC'),
      calendar: 'weekday',
    });

    expect(schedule).toMatchObject({
      stationId: 'PGC',
      displayCode: 'NE18',
      stopSequence: 3,
      sourceCalendar: null,
      firstTrainTime: null,
      lastTrainTime: null,
      windows: [],
    });
  });

  test('rejects overlapping estimates at a station', () => {
    const overlappingRevision = {
      ...revision,
      estimatedFrequency: {
        ...estimatedFrequency,
        periods: [
          estimatedFrequency.periods[0],
          {
            ...estimatedFrequency.periods[0],
            id: 'overlapping_peak',
            start: '08:00',
            end: '10:00',
          },
        ],
      },
    };

    expect(() =>
      generateEstimatedStationFrequencySchedule({
        serviceId: 'NEL_MAIN_N',
        revision: overlappingRevision,
        station: harbourFront,
        calendar: 'weekday',
      }),
    ).toThrow('Estimated frequency periods overlap');
  });
});

describe('generateEstimatedServiceStationFrequencySchedules', () => {
  test('returns every path station in order', () => {
    const schedules = generateEstimatedServiceStationFrequencySchedules({
      serviceId: 'NEL_MAIN_N',
      revision,
      stations: [station('PGC'), sengkang, harbourFront],
      calendar: 'weekday',
    });

    expect(schedules.map(({ stationId }) => stationId)).toEqual([
      'HBF',
      'SKG',
      'PGC',
    ]);
    expect(schedules.map(({ stopSequence }) => stopSequence)).toEqual([
      1, 2, 3,
    ]);
  });

  test('preserves repeated stops in loop service paths', () => {
    const loopRevision = {
      ...revision,
      path: {
        stations: [
          { stationId: 'SKG', displayCode: 'STC' },
          { stationId: 'HBF', displayCode: 'NE1' },
          { stationId: 'SKG', displayCode: 'STC' },
        ],
      },
    };

    const schedules = generateEstimatedServiceStationFrequencySchedules({
      serviceId: 'NEL_MAIN_N',
      revision: loopRevision,
      stations: [harbourFront, sengkang],
      calendar: 'weekday',
    });

    expect(
      schedules.map(({ stationId, stopSequence }) => [stationId, stopSequence]),
    ).toEqual([
      ['SKG', 1],
      ['HBF', 2],
      ['SKG', 3],
    ]);
  });
});

describe('enumerateEstimatedStationDepartures', () => {
  test('enumerates the weekday northbound schedule at Outram Park', () => {
    const outramParkRevision = {
      ...revision,
      path: {
        stations: [{ stationId: 'OTP', displayCode: 'NE3' }],
      },
    };
    const outramPark = station('OTP', {
      weekday: { firstTrain: '05:48', lastTrain: '23:59' },
    });
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision: outramParkRevision,
      station: outramPark,
      calendar: 'weekday',
    });

    const departures = enumerateEstimatedStationDepartures(schedule);

    expect(departures).toHaveLength(211);
    expect(departures.slice(0, 3)).toMatchObject([
      { time: '05:48:00', basis: 'first_train', headwaySeconds: 360 },
      { time: '05:54:00', basis: 'frequency_estimate' },
      { time: '06:00:00', basis: 'frequency_estimate' },
    ]);
    expect(
      departures.filter(({ time }) => time >= '06:54:00' && time <= '07:05:00'),
    ).toMatchObject([
      { time: '06:54:00', basis: 'frequency_estimate' },
      {
        time: '07:00:00',
        basis: 'frequency_estimate',
        headwaySeconds: 150,
        sourcePeriodId: 'weekday_morning_peak',
      },
      { time: '07:02:30', basis: 'frequency_estimate' },
      { time: '07:05:00', basis: 'frequency_estimate' },
    ]);
    expect(
      departures.filter(({ time }) => time >= '08:57:30' && time <= '09:06:00'),
    ).toMatchObject([
      { time: '08:57:30', headwaySeconds: 150 },
      { time: '09:00:00', headwaySeconds: 360 },
      { time: '09:06:00', headwaySeconds: 360 },
    ]);
    expect(departures.slice(-2)).toMatchObject([
      { time: '23:53:00', basis: 'frequency_estimate' },
      { time: '23:59:00', basis: 'last_train' },
    ]);
    for (const [index, departure] of departures.slice(0, -1).entries()) {
      const nextDeparture = departures[index + 1];
      expect(nextDeparture).toBeDefined();
      const interval = (nextDeparture?.seconds ?? 0) - departure.seconds;
      expect(interval).toBeGreaterThanOrEqual(
        departure.headwayRangeSeconds.min,
      );
      expect(interval).toBeLessThanOrEqual(departure.headwayRangeSeconds.max);
    }
  });

  test('deduplicates a last train that falls on the estimated sequence', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision: {
        ...revision,
        path: { stations: [{ stationId: 'HBF', displayCode: 'NE1' }] },
      },
      station: station('HBF', {
        saturday: { firstTrain: '06:00', lastTrain: '06:12' },
      }),
      calendar: 'saturday',
    });

    expect(enumerateEstimatedStationDepartures(schedule)).toMatchObject([
      { time: '06:00:00', basis: 'first_train' },
      { time: '06:06:00', basis: 'frequency_estimate' },
      { time: '06:12:00', basis: 'last_train' },
    ]);
  });

  test('uses service-day times after midnight', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision: {
        ...revision,
        path: { stations: [{ stationId: 'SKG', displayCode: 'NE16' }] },
      },
      station: sengkang,
      calendar: 'saturday',
    });

    expect(enumerateEstimatedStationDepartures(schedule).at(-1)).toMatchObject({
      time: '24:27:00',
      basis: 'last_train',
    });
  });

  test('returns no departures when station timing is unavailable', () => {
    const schedule = generateEstimatedStationFrequencySchedule({
      serviceId: 'NEL_MAIN_N',
      revision,
      station: station('PGC'),
      calendar: 'weekday',
    });

    expect(enumerateEstimatedStationDepartures(schedule)).toEqual([]);
  });
});
