import z from 'zod';

export const FacilityEffectOutOfServiceSchema = z.object({
  kind: z.literal('facility-out-of-service'),
});
export type FacilityEffectOutOfService = z.infer<
  typeof FacilityEffectOutOfServiceSchema
>;

export const FacilityEffectDegradedSchema = z.object({
  kind: z.literal('facility-degraded'),
});
export type FacilityEffectDegraded = z.infer<
  typeof FacilityEffectDegradedSchema
>;

export const FacilityEffectSchema = z.discriminatedUnion('kind', [
  FacilityEffectOutOfServiceSchema,
  FacilityEffectDegradedSchema,
]);
export type FacilityEffect = z.infer<typeof FacilityEffectSchema>;
