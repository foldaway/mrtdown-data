import type { ChartConfig } from './schema/Chart.js';

export const CHART_CONFIGS: ChartConfig[] = [
  {
    dataTimeScale: {
      granularity: 'day',
      count: 7,
    },
  },
  {
    displayTimeScale: {
      granularity: 'month',
      count: 1,
    },
    dataTimeScale: {
      granularity: 'day',
      count: 28,
    },
  },
  {
    displayTimeScale: {
      granularity: 'year',
      count: 1,
    },
    dataTimeScale: {
      granularity: 'month',
      count: 12,
    },
  },
  {
    dataTimeScale: {
      granularity: 'year',
      count: 10,
    },
  },
  {
    dataTimeScale: {
      granularity: 'year',
      count: 20,
    },
  },
];
