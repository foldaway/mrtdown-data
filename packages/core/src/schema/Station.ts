import z from 'zod';
import { TranslationsSchema } from './common.js';

export const StationSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  geo: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  stationCodes: z.array(
    z.object({
      lineId: z.string(),
      code: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      structureType: z.enum([
        'elevated',
        'underground',
        'at_grade',
        'in_building',
      ]),
    }),
  ),
  landmarkIds: z.array(z.string()),
  townId: z.string(),
});
export type Station = z.infer<typeof StationSchema>;
