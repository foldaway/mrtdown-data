import z from 'zod';
import { TranslationsSchema } from './common.js';

export const StationFirstLastTrainCalendarSchema = z.enum([
  'weekday',
  'saturday',
  'sunday_public_holiday',
  'weekday_saturday',
  'daily',
]);
export type StationFirstLastTrainCalendar = z.infer<
  typeof StationFirstLastTrainCalendarSchema
>;

export const StationFirstLastTrainEntrySchema = z
  .object({
    serviceId: z.string(),
    calendar: StationFirstLastTrainCalendarSchema,
    firstTrain: z.iso.time().nullable(),
    lastTrain: z.iso.time().nullable(),
  })
  .refine(
    (entry) => entry.firstTrain !== null || entry.lastTrain !== null,
    'At least one of firstTrain or lastTrain must be set',
  );
export type StationFirstLastTrainEntry = z.infer<
  typeof StationFirstLastTrainEntrySchema
>;

export const StationFirstLastTrainSchema = z.object({
  entries: z.array(StationFirstLastTrainEntrySchema),
});
export type StationFirstLastTrain = z.infer<typeof StationFirstLastTrainSchema>;

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
  firstLastTrain: StationFirstLastTrainSchema.optional(),
});
export type Station = z.infer<typeof StationSchema>;
