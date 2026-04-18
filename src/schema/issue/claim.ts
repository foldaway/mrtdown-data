import z from 'zod';
import { AffectedEntitySchema } from './entity.js';
import { FacilityEffectSchema } from './facilityEffect.js';
import { PeriodFixedSchema, PeriodRecurringSchema } from './period.js';
import { ServiceEffectSchema } from './serviceEffect.js';
import { ServiceScopeSchema } from './serviceScope.js';
import { CauseSubtypeSchema } from './cause.js';

export const ClaimStatusSignalSchema = z.enum(['open', 'cleared', 'planned']);
export type ClaimStatusSignal = z.infer<typeof ClaimStatusSignalSchema>;

export const ClaimTimeHintsSchema = z.discriminatedUnion('kind', [
  PeriodFixedSchema,
  PeriodRecurringSchema,
  z.object({
    kind: z.literal('start-only'),
    startAt: z.iso.datetime({ offset: true }),
  }),
  z.object({
    kind: z.literal('end-only'),
    endAt: z.iso.datetime({ offset: true }),
  }),
]);
export type ClaimTimeHints = z.infer<typeof ClaimTimeHintsSchema>;

export const ClaimSchema = z.object({
  entity: AffectedEntitySchema,
  effect: z
    .object({
      service: ServiceEffectSchema.nullable(),
      facility: FacilityEffectSchema.nullable(),
    })
    .nullable(),
  scopes: z.object({
    service: z.array(ServiceScopeSchema).nullable(),
  }),
  statusSignal: ClaimStatusSignalSchema.nullable(),
  timeHints: ClaimTimeHintsSchema.nullable(),
  causes: z.array(CauseSubtypeSchema).nullable(),
});

export type Claim = z.infer<typeof ClaimSchema>;
