import type { Service, Station } from '@mrtdown/core';
import { describe, expect, it } from 'vitest';
import { scheduleTopologyProjection } from './topology.js';

const station = {
  id: 'S',
  name: { en: 'Station' },
  geo: { latitude: 1, longitude: 103 },
  stationCodes: [
    { lineId: 'EWL', code: 'EW1', startedAt: '2000-01-01', endedAt: null },
  ],
  layout: {
    platforms: [
      {
        id: 'P',
        label: 'A',
        lineId: 'EWL',
        lastUpdated: '2026-01-01',
        serviceIds: ['B', 'A'],
      },
    ],
  },
} as unknown as Station;
const service = {
  id: 'A',
  lineId: 'EWL',
  revisions: [
    {
      id: 'r',
      startAt: '2000-01-01',
      endAt: null,
      path: {
        stations: [
          { stationId: 'S', displayCode: 'EW1' },
          { stationId: 'D', displayCode: 'EW2' },
        ],
      },
    },
  ],
} as unknown as Service;
function projection(stations = [station], services = [service]) {
  return scheduleTopologyProjection({
    operators: [],
    lines: [],
    stations,
    services,
  });
}
describe('schedule topology projection', () => {
  it('ignores editorial and geographic edits but detects platform identity changes', () => {
    const edited = structuredClone(station);
    edited.name.en = 'New name';
    edited.geo.latitude = 2;
    expect(projection([edited])).toEqual(projection());
    if (edited.layout?.platforms?.[0]) edited.layout.platforms[0].label = 'B';
    expect(projection([edited])).not.toEqual(projection());
  });
  it('sorts unordered IDs and records without discarding service path order', () => {
    const edited = structuredClone(station);
    edited.layout?.platforms?.[0]?.serviceIds?.reverse();
    expect(projection([edited])).toEqual(projection());
    const second = { ...station, id: 'D' };
    expect(projection([station, second])).toEqual(
      projection([second, station]),
    );
    const reversed = structuredClone(service);
    reversed.revisions[0]?.path.stations.reverse();
    expect(projection([station], [reversed])).not.toEqual(projection());
  });
});
