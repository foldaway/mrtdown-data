import z from 'zod';
import { OperatingHoursSchema, TranslationsSchema } from './common.js';

export const ServiceDayTypeSchema = z.enum(['weekdays', 'weekends']);
export type ServiceDayType = z.infer<typeof ServiceDayTypeSchema>;

export const EstimatedHeadwaySchema = z
  .object({
    minSeconds: z.number().int().positive(),
    maxSeconds: z.number().int().positive(),
    representativeSeconds: z.number().int().positive(),
  })
  .refine(
    ({ minSeconds, maxSeconds, representativeSeconds }) =>
      minSeconds <= representativeSeconds &&
      representativeSeconds <= maxSeconds,
    {
      message:
        'representativeSeconds must be between minSeconds and maxSeconds',
      path: ['representativeSeconds'],
    },
  );
export type EstimatedHeadway = z.infer<typeof EstimatedHeadwaySchema>;

export const EstimatedFrequencyPeriodSchema = z
  .object({
    id: z.string().min(1),
    dayType: ServiceDayTypeSchema,
    start: z.iso.time(),
    end: z.iso.time(),
    headway: EstimatedHeadwaySchema,
  })
  .refine(({ start, end }) => start !== end, {
    message: 'start and end must differ',
    path: ['end'],
  });
export type EstimatedFrequencyPeriod = z.infer<
  typeof EstimatedFrequencyPeriodSchema
>;

export const EstimatedFrequencyProfileSchema = z.object({
  source: z.object({
    url: z.url(),
    description: z.string().min(1),
    retrievedAt: z.iso.date(),
  }),
  defaultHeadway: EstimatedHeadwaySchema,
  periods: z.array(EstimatedFrequencyPeriodSchema),
});
export type EstimatedFrequencyProfile = z.infer<
  typeof EstimatedFrequencyProfileSchema
>;

export const ServiceRevisionSchema = z.object({
  id: z.string(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  path: z.object({
    /**
     * The station IDs in the order they are visited by the service.
     */
    stations: z.array(
      z.object({
        stationId: z.string(),
        displayCode: z.string(),
      }),
    ),
  }),
  operatingHours: OperatingHoursSchema,
  estimatedFrequency: EstimatedFrequencyProfileSchema.optional(),
});
export type ServiceRevision = z.infer<typeof ServiceRevisionSchema>;

export const ServiceSchema = z.object({
  id: z.string(),
  name: TranslationsSchema,
  lineId: z.string(),
  revisions: z.array(ServiceRevisionSchema),
});
export type Service = z.infer<typeof ServiceSchema>;
