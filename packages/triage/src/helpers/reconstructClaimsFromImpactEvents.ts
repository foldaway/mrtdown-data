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

    const anyEvent = effectsEvent ?? periodsEvent ?? scopesEvent ?? causesEvent;
    if (!anyEvent) continue;

    const entity = (anyEvent as { entity: AffectedEntity }).entity;

    let reconstructedTimeHints: ClaimTimeHints[] = [];

    if (
      periodsEvent?.type === 'periods.set' &&
      periodsEvent.periods.length > 0
    ) {
      const currentEntityPeriods: Period[] =
        entity.type === 'service'
          ? (currentState.services[entityKey]?.periods ?? [])
          : (currentState.facilities[entityKey]?.periods ?? []);

      const currentOpenPeriod = currentEntityPeriods.find(
        (p): p is Period & { kind: 'fixed'; endAt: null } =>
          p.kind === 'fixed' && p.endAt == null,
      );

      reconstructedTimeHints = periodsEvent.periods.map((period) =>
        reconstructTimeHintsForPeriod(period, currentOpenPeriod),
      );
    }

    const baseClaim: Omit<Claim, 'timeHints'> = {
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
      causes: causesEvent?.type === 'causes.set' ? causesEvent.causes : null,
    };

    if (reconstructedTimeHints.length === 0) {
      claims.push({
        ...baseClaim,
        timeHints: null,
      });
      continue;
    }

    for (const timeHints of reconstructedTimeHints) {
      claims.push({
        ...baseClaim,
        timeHints,
      });
    }
  }

  return claims;
}

function reconstructTimeHintsForPeriod(
  period: Period,
  currentOpenPeriod: (Period & { kind: 'fixed'; endAt: null }) | undefined,
): ClaimTimeHints {
  if (period.kind === 'recurring') {
    return period;
  }

  const updatesCurrentOpenPeriod =
    currentOpenPeriod != null && period.startAt === currentOpenPeriod.startAt;

  if (period.endAt == null) {
    if (updatesCurrentOpenPeriod) {
      return { kind: 'start-only', startAt: period.startAt };
    }
    return {
      kind: 'fixed',
      startAt: period.startAt,
      endAt: null,
    };
  }

  if (updatesCurrentOpenPeriod) {
    return { kind: 'end-only', endAt: period.endAt };
  }

  return {
    kind: 'fixed',
    startAt: period.startAt,
    endAt: period.endAt,
  };
}
