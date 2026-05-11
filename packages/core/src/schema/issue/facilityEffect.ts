import z from 'zod';

export const FacilityEffectKindSchema = z.enum([
  'out-of-service',
  'degraded',
]);
export type FacilityEffectKind = z.infer<typeof FacilityEffectKindSchema>;

export const FacilityEffectOutOfServiceSchema = z.object({
  kind: z.literal(FacilityEffectKindSchema.enum['out-of-service']),
});
export type FacilityEffectOutOfService = z.infer<
  typeof FacilityEffectOutOfServiceSchema
>;

export const FacilityEffectDegradedSchema = z.object({
  kind: z.literal(FacilityEffectKindSchema.enum.degraded),
});
export type FacilityEffectDegraded = z.infer<
  typeof FacilityEffectDegradedSchema
>;

export const FacilityEffectSchema = z.discriminatedUnion('kind', [
  FacilityEffectOutOfServiceSchema,
  FacilityEffectDegradedSchema,
]);
export type FacilityEffect = z.infer<typeof FacilityEffectSchema>;
