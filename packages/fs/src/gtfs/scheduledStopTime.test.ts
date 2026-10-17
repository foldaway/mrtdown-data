import { describe, expect, it } from 'vitest';
import { scheduledStopTimeFromGtfs } from './scheduledStopTime.js';

const row = {
  trip_id: 'T',
  stop_id: 'P',
  stop_sequence: '09007199254740993',
  arrival_time: '6:21:30',
  departure_time: '6:23:10',
};

describe('scheduledStopTimeFromGtfs', () => {
  it('applies source defaults and keeps occurrence identity without numeric coercion', () => {
    expect(scheduledStopTimeFromGtfs(row)).toEqual({
      providerTripId: 'T',
      providerStopId: 'P',
      stopSequence: '09007199254740993',
      arrivalSeconds: 22890,
      departureSeconds: 22990,
      pickupType: 0,
      dropOffType: 0,
      timepoint: 1,
    });
    expect(
      scheduledStopTimeFromGtfs({
        ...row,
        pickup_type: '',
        drop_off_type: '',
        timepoint: '',
      }),
    ).toEqual(scheduledStopTimeFromGtfs(row));
  });
  it('preserves elapsed time beyond midnight instead of wrapping to clock time', () => {
    expect(
      scheduledStopTimeFromGtfs({
        ...row,
        arrival_time: '24:10:00',
        departure_time: '25:02:03',
      }),
    ).toMatchObject({
      arrivalSeconds: 87000,
      departureSeconds: 90123,
      timepoint: 1,
    });
  });
  it('keeps separate visits to the same stop with exact large source sequences', () => {
    const first = scheduledStopTimeFromGtfs({
      ...row,
      stop_sequence: '9007199254740992',
    });
    const second = scheduledStopTimeFromGtfs({
      ...row,
      stop_sequence: '9007199254740993',
    });
    expect(first.providerStopId).toBe(second.providerStopId);
    expect(first.stopSequence).not.toBe(second.stopSequence);
  });
  it.each([
    '0',
    '1',
    '2',
    '3',
  ])('retains pickup and drop-off code %s', (value) => {
    expect(
      scheduledStopTimeFromGtfs({
        ...row,
        pickup_type: value,
        drop_off_type: value,
      }),
    ).toMatchObject({ pickupType: Number(value), dropOffType: Number(value) });
  });
  it('preserves approximate supplied times and missing times without interpolation', () => {
    expect(scheduledStopTimeFromGtfs({ ...row, timepoint: '0' })).toMatchObject(
      { timepoint: 0, arrivalSeconds: 22890 },
    );
    expect(
      scheduledStopTimeFromGtfs({
        ...row,
        timepoint: '0',
        arrival_time: '',
        departure_time: '',
      }),
    ).toMatchObject({
      timepoint: 0,
      arrivalSeconds: null,
      departureSeconds: null,
    });
    expect(
      scheduledStopTimeFromGtfs({ ...row, timepoint: '0', arrival_time: '' }),
    ).toMatchObject({ arrivalSeconds: null, departureSeconds: 22990 });
  });
  it('distinguishes explicit scheduled midnight from an absent time', () => {
    expect(
      scheduledStopTimeFromGtfs({
        ...row,
        arrival_time: '00:00:00',
        departure_time: '00:00:00',
      }),
    ).toMatchObject({ arrivalSeconds: 0, departureSeconds: 0 });
  });
  it('rejects missing exact times and departure-before-arrival without repairing the source', () => {
    expect(() =>
      scheduledStopTimeFromGtfs({ ...row, arrival_time: '' }),
    ).toThrow('exact timepoint');
    expect(() =>
      scheduledStopTimeFromGtfs({ ...row, timepoint: '1', departure_time: '' }),
    ).toThrow('exact timepoint');
    expect(() =>
      scheduledStopTimeFromGtfs({
        ...row,
        arrival_time: '23:59:00',
        departure_time: '00:00:00',
      }),
    ).toThrow('Departure cannot precede arrival');
  });
  it.each([
    '6:60:00',
    '25:03:60',
    '-1:00:00',
    '1e2:00:00',
    ' 06:00:00',
    '999999999999999999999999999999:00:00',
  ])('rejects invalid or unsafe source times: %s', (arrival_time) => {
    expect(() => scheduledStopTimeFromGtfs({ ...row, arrival_time })).toThrow(
      'Invalid GTFS arrival_time',
    );
  });
  it.each([
    ['pickup_type', '4'],
    ['pickup_type', '01'],
    ['drop_off_type', '1.0'],
    ['drop_off_type', ' '],
    ['timepoint', '2'],
  ])('rejects nonliteral enum %s=%s', (field, value) => {
    expect(() => scheduledStopTimeFromGtfs({ ...row, [field]: value })).toThrow(
      `Invalid GTFS ${field}`,
    );
  });
  it.each([
    'trip_id',
    'stop_id',
    'stop_sequence',
  ])('requires source identity %s', (field) => {
    expect(() => scheduledStopTimeFromGtfs({ ...row, [field]: '' })).toThrow();
  });
  it.each([
    'location_group_id',
    'location_id',
    'start_pickup_drop_off_window',
    'end_pickup_drop_off_window',
  ])('rejects on-demand fields rather than converting them to a fixed occurrence: %s', (field) => {
    expect(() =>
      scheduledStopTimeFromGtfs({ ...row, [field]: 'supplied' }),
    ).toThrow('Unsupported on-demand stop-time field');
  });
  it('leaves the source record intact, including fields outside the timing contract', () => {
    const source = Object.freeze({
      ...row,
      stop_headsign: 'Actual short working',
    });
    const before = JSON.stringify(source);
    scheduledStopTimeFromGtfs(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(source.stop_headsign).toBe('Actual short working');
  });
});
