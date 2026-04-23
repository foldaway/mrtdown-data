import z from 'zod';

export const ServiceEffectKindSchema = z.enum([
  'delay',
  'no-service',
  'reduced-service',
  'service-hours-adjustment',
]);
export type ServiceEffectKind = z.infer<typeof ServiceEffectKindSchema>;

export const ServiceEffectDelaySchema = z.object({
  kind: z.literal(ServiceEffectKindSchema.enum.delay),
  duration: z.iso.duration().nullable(),
});
export type ServiceEffectDelay = z.infer<typeof ServiceEffectDelaySchema>;

export const ServiceEffectNoServiceSchema = z.object({
  kind: z.literal(ServiceEffectKindSchema.enum['no-service']),
});
export type ServiceEffectNoService = z.infer<
  typeof ServiceEffectNoServiceSchema
>;

export const ServiceEffectReducedServiceSchema = z.object({
  kind: z.literal(ServiceEffectKindSchema.enum['reduced-service']),
});
export type ServiceEffectReducedService = z.infer<
  typeof ServiceEffectReducedServiceSchema
>;

export const ServiceEffectServiceHoursAdjustmentSchema = z.object({
  kind: z.literal(ServiceEffectKindSchema.enum['service-hours-adjustment']),
});
export type ServiceEffectServiceHoursAdjustment = z.infer<
  typeof ServiceEffectServiceHoursAdjustmentSchema
>;

export const ServiceEffectSchema = z.discriminatedUnion('kind', [
  ServiceEffectDelaySchema,
  ServiceEffectNoServiceSchema,
  ServiceEffectReducedServiceSchema,
  ServiceEffectServiceHoursAdjustmentSchema,
]);
export type ServiceEffect = z.infer<typeof ServiceEffectSchema>;
