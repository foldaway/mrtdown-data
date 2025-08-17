import z from 'zod';
import { GranularitySchema } from './Granularity.js';

export const TimeScaleSchema = z
  .object({
    granularity: GranularitySchema,
    count: z.number().int().positive(),
  })
  .meta({
    ref: 'TimeScale',
  });
export type TimeScale = z.infer<typeof TimeScaleSchema>;

export const ChartConfigSchema = z.object({
  displayTimeScale: TimeScaleSchema.optional(),
  dataTimeScale: TimeScaleSchema,
});
export type ChartConfig = z.infer<typeof ChartConfigSchema>;

export const ChartEntrySchema = z
  .object({
    name: z.string(),
    payload: z.record(z.string(), z.number()),
  })
  .meta({
    ref: 'ChartEntry',
    description:
      'An entry in a chart, representing a data point with a name and associated payload.',
  });
export type ChartEntry = z.infer<typeof ChartEntrySchema>;

export const ChartSchema = z
  .object({
    title: z.string(),
    data: z.array(ChartEntrySchema),
  })
  .meta({
    ref: 'Chart',
    description: 'A chart containing a title and a list of data entries.',
  });
export type Chart = z.infer<typeof ChartSchema>;

export const TimeScaleChartSchema = ChartSchema.extend({
  displayTimeScale: TimeScaleSchema.optional().meta({
    description:
      'Optional time scale for display purposes, which can be different from the data granularity.',
  }),
  dataTimeScale: TimeScaleSchema,
  dataCumulative: z.array(ChartEntrySchema).meta({
    description: 'Cumulative data entries for the chart.',
  }),
}).meta({
  ref: 'TimeScaleChart',
  description:
    'A chart that includes time scale information for both display and data granularity.',
});
export type TimeScaleChart = z.infer<typeof TimeScaleChartSchema>;
