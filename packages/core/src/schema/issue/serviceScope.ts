import z from 'zod';

/**
 * Service Whole (service)
 */
export const ServiceScopeWholeSchema = z.object({
  type: z.literal('service.whole'),
});
export type ServiceScopeWhole = z.infer<typeof ServiceScopeWholeSchema>;

/**
 * Service segment (service-level)
 *
 * This should also be used when representing an entire service.
 */
export const ServiceScopeSegmentSchema = z.object({
  type: z.literal('service.segment'),
  fromStationId: z.string(),
  toStationId: z.string(),
});
export type ServiceScopeSegment = z.infer<typeof ServiceScopeSegmentSchema>;

/**
 * Service point (station-level)
 */
export const ServiceScopePointSchema = z.object({
  type: z.literal('service.point'),
  stationId: z.string(),
});
export type ServiceScopePoint = z.infer<typeof ServiceScopePointSchema>;

export const ServiceScopeSchema = z.discriminatedUnion('type', [
  ServiceScopeWholeSchema,
  ServiceScopeSegmentSchema,
  ServiceScopePointSchema,
]);
export type ServiceScope = z.infer<typeof ServiceScopeSchema>;
