import z from 'zod';
import { CauseSubtypeSchema } from './cause.js';
import { AffectedEntitySchema } from './entity.js';
import { FacilityEffectSchema } from './facilityEffect.js';
import { PeriodSchema } from './period.js';
import { ServiceEffectSchema } from './serviceEffect.js';
import { ServiceScopeSchema } from './serviceScope.js';

export const ImpactEventBaseSchema = z.object({
  id: z.string(),
  entity: AffectedEntitySchema,
  ts: z.iso.datetime({ offset: true }),
  basis: z.object({
    evidenceId: z.string(),
  }),
});
export type ImpactEventBase = z.infer<typeof ImpactEventBaseSchema>;

export const ImpactEventPeriodsSetSchema = ImpactEventBaseSchema.extend({
  type: z.literal('periods.set'),
  periods: z.array(PeriodSchema),
});
export type ImpactEventPeriodsSet = z.infer<typeof ImpactEventPeriodsSetSchema>;

export const ImpactEventServiceScopeSetSchema = ImpactEventBaseSchema.extend({
  type: z.literal('service_scopes.set'),
  serviceScopes: z.array(ServiceScopeSchema),
});
export type ImpactEventServiceScopeSet = z.infer<
  typeof ImpactEventServiceScopeSetSchema
>;

export const ImpactEventServiceEffectSetSchema = ImpactEventBaseSchema.extend({
  type: z.literal('service_effects.set'),
  effect: ServiceEffectSchema,
});
export type ImpactEventServiceEffectSet = z.infer<
  typeof ImpactEventServiceEffectSetSchema
>;

export const ImpactEventFacilityEffectSetSchema = ImpactEventBaseSchema.extend({
  type: z.literal('facility_effects.set'),
  effect: FacilityEffectSchema,
});
export type ImpactEventFacilityEffectSet = z.infer<
  typeof ImpactEventFacilityEffectSetSchema
>;

export const ImpactEventCausesSetSchema = ImpactEventBaseSchema.extend({
  type: z.literal('causes.set'),
  causes: z.array(CauseSubtypeSchema),
});
export type ImpactEventCauseSet = z.infer<typeof ImpactEventCausesSetSchema>;

export const ImpactEventSchema = z.discriminatedUnion('type', [
  ImpactEventPeriodsSetSchema,
  ImpactEventServiceScopeSetSchema,
  ImpactEventServiceEffectSetSchema,
  ImpactEventFacilityEffectSetSchema,
  ImpactEventCausesSetSchema,
]);
export type ImpactEvent = z.infer<typeof ImpactEventSchema>;
