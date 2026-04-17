import type {
  AffectedEntity,
  Claim,
  ClaimTimeHints,
  ImpactEvent,
  Period,
} from '@mrtdown/core';
import type { IssueBundleState } from './deriveCurrentState.js';
import { keyForAffectedEntity } from './keyForAffectedEntity.js';

/**
 * Reconstruct Claim[] from a group of ImpactEvents that all share the same
 * evidenceId.  Time hints are derived by comparing the new period against the
 * pre-evidence rolling state:
 *
 *  - updating an open-ended fixed period → start-only  (preserves anchor startAt)
 *  - closing  an open-ended fixed period → end-only    (preserves anchor startAt)
 *  - opening  a fresh / re-opening       → fixed       (explicit bounds)
 *  - recurring period                    → recurring   (verbatim)
 */
export function reconstructClaimsFromImpactEvents(
  originalEvents: ImpactEvent[],
  currentState: IssueBundleState,
): Claim[] {
  const eventsByEntity = new Map<string, ImpactEvent[]>();
  for (const impEv of originalEvents) {
    const key = keyForAffectedEntity(
      (impEv as { entity: AffectedEntity }).entity,
    );
    const list = eventsByEntity.get(key) ?? [];
    list.push(impEv);
    eventsByEntity.set(key, list);
  }

  const claims: Claim[] = [];

  for (const [entityKey, entityEvents] of eventsByEntity) {
    const effectsEvent = entityEvents.find(
      (e) =>
        e.type === 'service_effects.set' || e.type === 'facility_effects.set',
    );
    const periodsEvent = entityEvents.find((e) => e.type === 'periods.set');
    const scopesEvent = entityEvents.find(
      (e) => e.type === 'service_scopes.set',
    );
    const causesEvent = entityEvents.find((e) => e.type === 'causes.set');

    const anyEvent =
      effectsEvent ?? periodsEvent ?? scopesEvent ?? causesEvent;
    if (!anyEvent) continue;

    const entity = (anyEvent as { entity: AffectedEntity }).entity;

    let timeHints: ClaimTimeHints | null = null;

    if (periodsEvent?.type === 'periods.set' && periodsEvent.periods.length > 0) {
      const newPeriod = periodsEvent.periods[0] as Period;

      if (newPeriod.kind === 'recurring') {
        timeHints = newPeriod;
      } else {
        const currentEntityPeriods: Period[] =
          entity.type === 'service'
            ? (currentState.services[entityKey]?.periods ?? [])
            : (currentState.facilities[entityKey]?.periods ?? []);

        const currentOpenPeriod = currentEntityPeriods.find(
          (p): p is Period & { kind: 'fixed'; endAt: null } =>
            p.kind === 'fixed' && p.endAt == null,
        );

        if (newPeriod.endAt == null) {
          if (currentOpenPeriod) {
            timeHints = { kind: 'start-only', startAt: newPeriod.startAt };
          } else {
            timeHints = {
              kind: 'fixed',
              startAt: newPeriod.startAt,
              endAt: null,
            };
          }
        } else {
          if (currentOpenPeriod) {
            timeHints = { kind: 'end-only', endAt: newPeriod.endAt };
          } else {
            timeHints = {
              kind: 'fixed',
              startAt: newPeriod.startAt,
              endAt: newPeriod.endAt,
            };
          }
        }
      }
    }

    const claim: Claim = {
      entity,
      effect:
        effectsEvent?.type === 'service_effects.set'
          ? { service: effectsEvent.effect, facility: null }
          : effectsEvent?.type === 'facility_effects.set'
            ? { service: null, facility: effectsEvent.effect }
            : null,
      scopes:
        scopesEvent?.type === 'service_scopes.set'
          ? { service: scopesEvent.serviceScopes }
          : { service: null },
      statusSignal: null,
      timeHints,
      causes:
        causesEvent?.type === 'causes.set' ? causesEvent.causes : null,
    };

    claims.push(claim);
  }

  return claims;
}
