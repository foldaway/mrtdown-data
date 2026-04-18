import z from 'zod';

export const ServiceEffectDelaySchema = z.object({
  kind: z.literal('delay'),
  duration: z.iso.duration().nullable(),
});
export type ServiceEffectDelay = z.infer<typeof ServiceEffectDelaySchema>;

export const ServiceEffectNoServiceSchema = z.object({
  kind: z.literal('no-service'),
});
export type ServiceEffectNoService = z.infer<
  typeof ServiceEffectNoServiceSchema
>;

export const ServiceEffectReducedServiceSchema = z.object({
  kind: z.literal('reduced-service'),
});
export type ServiceEffectReducedService = z.infer<
  typeof ServiceEffectReducedServiceSchema
>;

export const ServiceEffectServiceHoursAdjustmentSchema = z.object({
  kind: z.literal('service-hours-adjustment'),
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
