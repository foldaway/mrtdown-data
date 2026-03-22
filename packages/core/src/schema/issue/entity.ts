import z from 'zod';
import { FacilityEffectSchema } from './facilityEffect.js';
import { PeriodSchema } from './period.js';
import { ServiceEffectSchema } from './serviceEffect.js';
import { ServiceScopeSchema } from './serviceScope.js';

export const AffectedEntityServiceSchema = z.object({
  type: z.literal('service'),
  serviceId: z.string(),
});
export type AffectedEntityService = z.infer<typeof AffectedEntityServiceSchema>;

export const AffectedEntityFacilityKindSchema = z.enum([
  'lift',
  'escalator',
  'screen-door',
]);
export type AffectedEntityFacilityKind = z.infer<
  typeof AffectedEntityFacilityKindSchema
>;

export const AffectedEntityFacilitySchema = z.object({
  type: z.literal('facility'),
  stationId: z.string(),
  kind: z.literal(AffectedEntityFacilityKindSchema.enum.lift),
});
export type AffectedEntityFacility = z.infer<
  typeof AffectedEntityFacilitySchema
>;

export const AffectedEntitySchema = z.discriminatedUnion('type', [
  AffectedEntityServiceSchema,
  AffectedEntityFacilitySchema,
]);
export type AffectedEntity = z.infer<typeof AffectedEntitySchema>;

export const EntityImpactStateSchema = z.object({
  serviceScopes: z.array(ServiceScopeSchema),
  periods: z.array(PeriodSchema),
  entity: AffectedEntitySchema,
  effects: z
    .object({
      service: ServiceEffectSchema.nullable(),
      facility: FacilityEffectSchema.nullable(),
    })
    .nullable(),
});

export type EntityImpactState = z.infer<typeof EntityImpactStateSchema>;

export const EntityImpactStateWithBasisSchema = EntityImpactStateSchema.extend({
  basis: z.object({
    evidenceIds: z.array(z.string()),
  }),
});

export type EntityImpactStateWithBasis = z.infer<
  typeof EntityImpactStateWithBasisSchema
>;
