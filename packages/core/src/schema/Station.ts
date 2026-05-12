import z from 'zod';
import { TranslationsSchema } from './common.js';

export const StationStructureTypeSchema = z.enum([
  'elevated',
  'underground',
  'at_grade',
  'in_building',
]);
export type StationStructureType = z.infer<typeof StationStructureTypeSchema>;

export const StationSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  geo: z.object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
  }),
  stationCodes: z.array(
    z.object({
      lineId: z.string(),
      code: z.string(),
      startedAt: z.iso.datetime(),
      endedAt: z.iso.datetime().nullable(),
      structureType: StationStructureTypeSchema,
    }),
  ),
  landmarkIds: z.array(z.string()),
  townId: z.string(),
});
export type Station = z.infer<typeof StationSchema>;
