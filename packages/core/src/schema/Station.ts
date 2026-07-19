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

export const StationLayoutExitSchema = z
  .object({
    sourceObjectId: z.number().int().positive(),
    sourceChecksum: z.string().regex(/^[0-9A-F]{16}$/),
    label: z.string().min(1),
    lastUpdated: z.iso.date(),
    geo: z.object({
      latitude: z.number().gte(-90).lte(90),
      longitude: z.number().gte(-180).lte(180),
    }),
  })
  .strict();
export type StationLayoutExit = z.infer<typeof StationLayoutExitSchema>;

export const StationLayoutExitSourceIdSchema = z.literal(
  'lta-mrt-station-exit-geojson',
);
export type StationLayoutExitSourceId = z.infer<
  typeof StationLayoutExitSourceIdSchema
>;

export const StationLayoutPlatformBoardingStatusSchema = z.enum([
  'alighting_only',
  'not_in_service',
]);
export type StationLayoutPlatformBoardingStatus = z.infer<
  typeof StationLayoutPlatformBoardingStatusSchema
>;

export const StationLayoutPlatformSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    lastUpdated: z.iso.date(),
    lineId: z.string().min(1),
    serviceIds: z.array(z.string().min(1)).min(1).optional(),
    boardingStatus: StationLayoutPlatformBoardingStatusSchema.optional(),
  })
  .strict()
  .superRefine((platform, context) => {
    if (platform.serviceIds && platform.boardingStatus) {
      context.addIssue({
        code: 'custom',
        message: 'non-boardable platforms must not advertise serviceIds',
        path: ['serviceIds'],
      });
    }
  });
export type StationLayoutPlatform = z.infer<typeof StationLayoutPlatformSchema>;

export const StationLayoutSchema = z
  .object({
    exitSourceId: StationLayoutExitSourceIdSchema.optional(),
    exits: z.array(StationLayoutExitSchema).min(1).optional(),
    platforms: z.array(StationLayoutPlatformSchema).min(1).optional(),
  })
  .strict()
  .superRefine((layout, context) => {
    if ((layout.exitSourceId == null) !== (layout.exits == null)) {
      context.addIssue({
        code: 'custom',
        message: 'exitSourceId and exits must be provided together',
        path: layout.exitSourceId == null ? ['exitSourceId'] : ['exits'],
      });
    }

    if (layout.exits == null && layout.platforms == null) {
      context.addIssue({
        code: 'custom',
        message: 'at least one of exits or platforms must be provided',
      });
    }
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
      startedAt: z.iso.date(),
      endedAt: z.iso.date().nullable(),
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
