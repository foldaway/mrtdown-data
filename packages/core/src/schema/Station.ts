import z from 'zod';
import { TranslationsSchema } from './common.js';
import { type IsoCountryCode, IsoCountryCodeSchema } from './IsoCountryCode.js';

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

export const StationFirstLastTrainSpecialCalendarSchema = z.enum([
  'eve_public_holiday',
]);
export type StationFirstLastTrainSpecialCalendar = z.infer<
  typeof StationFirstLastTrainSpecialCalendarSchema
>;

export const StationFirstLastTrainTimeSchema = z
  .object({
    firstTrain: z.iso.time().nullable(),
    lastTrain: z.iso.time().nullable(),
  })
  .refine(
    (entry) => entry.firstTrain != null || entry.lastTrain != null,
    'At least one of firstTrain or lastTrain must be set',
  );
export type StationFirstLastTrainTime = z.infer<
  typeof StationFirstLastTrainTimeSchema
>;

export const StationFirstLastTrainServiceSchema = z
  .object({
    serviceId: z.string(),
    times: z
      .partialRecord(
        StationFirstLastTrainCalendarSchema,
        StationFirstLastTrainTimeSchema,
      )
      .optional(),
    specialTimes: z
      .partialRecord(
        StationFirstLastTrainSpecialCalendarSchema,
        StationFirstLastTrainTimeSchema,
      )
      .optional(),
  })
  .refine(
    (service) =>
      Object.keys(service.times ?? {}).length > 0 ||
      Object.keys(service.specialTimes ?? {}).length > 0,
    'At least one of times or specialTimes must be set',
  );
export type StationFirstLastTrainService = z.infer<
  typeof StationFirstLastTrainServiceSchema
>;

export const StationFirstLastTrainSchema = z.object({
  services: z.array(StationFirstLastTrainServiceSchema),
});
export type StationFirstLastTrain = z.infer<typeof StationFirstLastTrainSchema>;

export const StationLayoutAccessPointKindSchema = z.enum([
  'stairs',
  'escalator',
  'lift',
  'travellator',
  'ramp',
  'gate',
  'concourse_link',
  'other',
]);
export type StationLayoutAccessPointKind = z.infer<
  typeof StationLayoutAccessPointKindSchema
>;

export const StationLayoutAccessPointPositionSchema = z.enum([
  'front',
  'middle',
  'rear',
  'unknown',
]);
export type StationLayoutAccessPointPosition = z.infer<
  typeof StationLayoutAccessPointPositionSchema
>;

export const StationLayoutAccessPointDirectionSchema = z.enum([
  'up',
  'down',
  'bidirectional',
  'unknown',
]);
export type StationLayoutAccessPointDirection = z.infer<
  typeof StationLayoutAccessPointDirectionSchema
>;

export const StationLayoutTransferEndpointKindSchema = z.enum([
  'platform',
  'access_point',
  'level',
]);
export type StationLayoutTransferEndpointKind = z.infer<
  typeof StationLayoutTransferEndpointKindSchema
>;

export const StationLayoutTransferModeSchema = z.enum([
  'walk',
  'stairs',
  'escalator',
  'lift',
  'travellator',
  'ramp',
]);
export type StationLayoutTransferMode = z.infer<
  typeof StationLayoutTransferModeSchema
>;

export const StationLayoutTransferClassificationSchema = z.enum([
  'same_platform',
  'short',
  'medium',
  'long',
  'out_of_station',
  'not_recommended',
  'restricted',
  'unknown',
]);
export type StationLayoutTransferClassification = z.infer<
  typeof StationLayoutTransferClassificationSchema
>;

export const StationLayoutLevelSchema = z.object({
  id: z.string(),
  index: z.number().int(),
  name: TranslationsSchema,
});
export type StationLayoutLevel = z.infer<typeof StationLayoutLevelSchema>;

export const StationLayoutExitSchema = z.object({
  id: z.string(),
  label: z.string(),
  levelId: z.string().optional(),
  geo: z
    .object({
      latitude: z.number().gte(-90).lte(90),
      longitude: z.number().gte(-180).lte(180),
    })
    .optional(),
  nearbyLandmarkIds: z.array(z.string()).optional(),
  roadNames: z.array(z.string()).optional(),
  paidArea: z.boolean(),
  accessibility: z
    .object({
      stepFree: z.boolean().optional(),
      lift: z.boolean().optional(),
    })
    .optional(),
});
export type StationLayoutExit = z.infer<typeof StationLayoutExitSchema>;

export const StationLayoutAccessPointSchema = z.object({
  id: z.string(),
  kind: StationLayoutAccessPointKindSchema,
  nearestDoor: z.string().optional(),
  position: StationLayoutAccessPointPositionSchema,
  connectsToLevelId: z.string().optional(),
  direction: StationLayoutAccessPointDirectionSchema.optional(),
});
export type StationLayoutAccessPoint = z.infer<
  typeof StationLayoutAccessPointSchema
>;

export const StationLayoutPlatformSchema = z.object({
  id: z.string(),
  label: z.string(),
  lineId: z.string(),
  levelId: z.string().optional(),
  serviceIds: z.array(z.string()).nonempty(),
  doorCount: z.number().int().positive().optional(),
  accessPoints: z.array(StationLayoutAccessPointSchema),
});
export type StationLayoutPlatform = z.infer<typeof StationLayoutPlatformSchema>;

export const StationLayoutTransferEndpointSchema = z.object({
  kind: StationLayoutTransferEndpointKindSchema,
  id: z.string(),
});
export type StationLayoutTransferEndpoint = z.infer<
  typeof StationLayoutTransferEndpointSchema
>;

export const StationLayoutTransferPathSchema = z.object({
  id: z.string(),
  from: StationLayoutTransferEndpointSchema,
  to: StationLayoutTransferEndpointSchema,
  paidArea: z.boolean(),
  modes: z.array(StationLayoutTransferModeSchema),
  levelChange: z.number().int().nullable(),
  classification: StationLayoutTransferClassificationSchema,
  estimatedTraversalSeconds: z.number().int().positive().nullable(),
  distanceMeters: z.number().positive().nullable(),
});
export type StationLayoutTransferPath = z.infer<
  typeof StationLayoutTransferPathSchema
>;

export const StationLayoutSchema = z.object({
  levels: z.array(StationLayoutLevelSchema),
  exits: z.array(StationLayoutExitSchema),
  platforms: z.array(StationLayoutPlatformSchema),
  transferPaths: z.array(StationLayoutTransferPathSchema),
});
export type StationLayout = z.infer<typeof StationLayoutSchema>;

export const StationAddressCountrySchema = IsoCountryCodeSchema;
export type StationAddressCountry = IsoCountryCode;

export const StationAddressSchema = z.object({
  streetAddress: z.string().optional(),
  postalCode: z.string().optional(),
  addressLocality: z.string().optional(),
  addressCountry: StationAddressCountrySchema.optional(),
});
export type StationAddress = z.infer<typeof StationAddressSchema>;

export const StationAliasSchema = z
  .string()
  .refine((alias) => alias.trim().length > 0, {
    message: 'Expected a non-empty alias after trimming',
  });
export type StationAlias = z.infer<typeof StationAliasSchema>;

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
  address: StationAddressSchema.optional(),
  aliases: z.array(StationAliasSchema).optional(),
  firstLastTrain: StationFirstLastTrainSchema.optional(),
  layout: StationLayoutSchema.optional(),
});
export type Station = z.infer<typeof StationSchema>;
