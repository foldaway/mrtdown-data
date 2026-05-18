import { deepStrictEqual } from 'node:assert';
import type {
  Claim,
  ClaimTimeHints,
  ImpactEvent,
  IssueBundle,
  Period,
} from '@mrtdown/core';
import { IdGenerator } from '@mrtdown/fs';
import { DateTime } from 'luxon';
import { assert } from '../util/assert.js';
import {
  deriveCurrentState,
  type IssueBundleState,
} from './deriveCurrentState.js';
import { keyForAffectedEntity } from './keyForAffectedEntity.js';

type Params = {
  issueBundle: IssueBundle;
  evidenceId: string;
  evidenceTs: string;
  claims: Claim[];
};

type Result = {
  newState: IssueBundleState;
  newImpactEvents: ImpactEvent[];
};

/**
 * Compute the impact from the evidence claims.
 * @param params - The parameters.
 * @returns The result.
 */
export function computeImpactFromEvidenceClaims(params: Params): Result {
  const currentState = deriveCurrentState(params.issueBundle);
  const result: Result = {
    newState: cloneIssueBundleState(currentState),
    newImpactEvents: [],
  };

  const eventTs = params.evidenceTs;
  const eventDateTime = DateTime.fromISO(eventTs);
  assert(eventDateTime.isValid, `Invalid date: ${eventTs}`);

  const claimsByAffectedEntity = new Map<string, Claim[]>();
  for (const claim of params.claims) {
    const key = keyForAffectedEntity(claim.entity);
    const current = claimsByAffectedEntity.get(key) ?? [];
    current.push(claim);
    claimsByAffectedEntity.set(key, current);
  }

  for (const [key, claims] of claimsByAffectedEntity) {
    const claim = mergeClaims(claims);
    if (claim == null) {
      continue;
    }

    switch (claim.entity.type) {
      case 'service': {
        const currentServiceState = result.newState.services[key] ?? {
          effect: null,
          scopes: [],
          periods: [],
          causes: [],
        };
        const currentServiceProvenance =
          result.newState.servicesProvenance[key] ?? {};

        // A service usually needs (or must establish) a period before effects
        // and scopes can be recorded. For maintenance/infra issues, we still
        // allow metadata-only claims (for example, informational maintenance
        // updates that explicitly say service is unchanged) to persist causes.
        const canPersistMetadataWithoutPeriods =
          params.issueBundle.issue.type !== 'disruption' &&
          claims.some((candidate) => candidate.causes != null);

        if (
          currentServiceState.periods.length === 0 &&
          claims.every((candidate) => candidate.timeHints == null) &&
          !canPersistMetadataWithoutPeriods
        ) {
          continue;
        }

        const canEmitServiceAttributes =
          currentServiceState.periods.length > 0 ||
          claims.some((candidate) => candidate.timeHints != null);

        if (
          canEmitServiceAttributes &&
          claim.effect?.service != null &&
          !isEqual(currentServiceState.effect, claim.effect.service)
        ) {
          currentServiceState.effect = claim.effect.service;
          currentServiceProvenance.effect = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'service_effects.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            effect: claim.effect.service,
          });
        }

        const reconciledServicePeriods = claims.reduce(
          (state, candidate) => {
            if (candidate.timeHints == null) {
              return state;
            }

            const { newPeriods, hasChanged } = reconcilePeriodsWithTimeHints(
              state.periods,
              clampTimeHintsToEvidenceTs(candidate.timeHints, eventTs),
            );

            return {
              periods: newPeriods,
              hasChanged: state.hasChanged || hasChanged,
            };
          },
          {
            periods: currentServiceState.periods,
            hasChanged: false,
          },
        );

        if (reconciledServicePeriods.hasChanged) {
          currentServiceState.periods = reconciledServicePeriods.periods;
          currentServiceProvenance.periods = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'periods.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            periods: currentServiceState.periods,
          });
        }

        if (
          canEmitServiceAttributes &&
          claim.scopes?.service != null &&
          !isEqual(currentServiceState.scopes, claim.scopes.service)
        ) {
          currentServiceState.scopes = claim.scopes.service;
          currentServiceProvenance.scopes = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'service_scopes.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            serviceScopes: claim.scopes.service,
          });
        }

        if (
          claim.causes != null &&
          !isEqual(currentServiceState.causes, claim.causes)
        ) {
          currentServiceState.causes = claim.causes;
          currentServiceProvenance.causes = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'causes.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            causes: claim.causes,
          });
        }

        result.newState.services[key] = currentServiceState;
        result.newState.servicesProvenance[key] = currentServiceProvenance;

        break;
      }
      case 'facility': {
        const currentFacilityState = result.newState.facilities[key] ?? {
          stationId: claim.entity.stationId,
          lineId: claim.entity.lineId ?? null,
          kind: claim.entity.kind,
          effect: null,
          periods: [],
          causes: [],
        };
        const currentFacilityProvenance =
          result.newState.facilitiesProvenance[key] ?? {};

        if (
          claim.effect?.facility != null &&
          !isEqual(currentFacilityState.effect, claim.effect.facility)
        ) {
          currentFacilityState.effect = claim.effect.facility;
          currentFacilityProvenance.effect = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'facility_effects.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            effect: claim.effect.facility,
          });
        }

        const reconciledFacilityPeriods = claims.reduce(
          (state, candidate) => {
            if (candidate.timeHints == null) {
              return state;
            }

            const { newPeriods, hasChanged } = reconcilePeriodsWithTimeHints(
              state.periods,
              clampTimeHintsToEvidenceTs(candidate.timeHints, eventTs),
            );

            return {
              periods: newPeriods,
              hasChanged: state.hasChanged || hasChanged,
            };
          },
          {
            periods: currentFacilityState.periods,
            hasChanged: false,
          },
        );

        if (reconciledFacilityPeriods.hasChanged) {
          currentFacilityState.periods = reconciledFacilityPeriods.periods;
          currentFacilityProvenance.periods = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'periods.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            periods: currentFacilityState.periods,
          });
        }

        if (
          claim.causes != null &&
          !isEqual(currentFacilityState.causes, claim.causes)
        ) {
          currentFacilityState.causes = claim.causes;
          currentFacilityProvenance.causes = {
            evidenceId: params.evidenceId,
          };
          addImpactEvent(result, {
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'causes.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            causes: claim.causes,
          });
        }

        result.newState.facilities[key] = currentFacilityState;
        result.newState.facilitiesProvenance[key] = currentFacilityProvenance;

        break;
      }
    }
  }

  return result;
}

function cloneIssueBundleState(state: IssueBundleState): IssueBundleState {
  return {
    services: Object.fromEntries(
      Object.entries(state.services).map(([key, value]) => [
        key,
        {
          ...value,
          scopes: [...value.scopes],
          periods: value.periods.map((period) => ({ ...period })),
          causes: [...value.causes],
        },
      ]),
    ),
    servicesProvenance: Object.fromEntries(
      Object.entries(state.servicesProvenance).map(([key, value]) => [
        key,
        { ...value },
      ]),
    ),
    facilities: Object.fromEntries(
      Object.entries(state.facilities).map(([key, value]) => [
        key,
        {
          ...value,
          periods: value.periods.map((period) => ({ ...period })),
          causes: [...(value.causes ?? [])],
        },
      ]),
    ),
    facilitiesProvenance: Object.fromEntries(
      Object.entries(state.facilitiesProvenance).map(([key, value]) => [
        key,
        { ...value },
      ]),
    ),
    impactEventIds: [...state.impactEventIds],
  };
}

function addImpactEvent(result: Result, event: ImpactEvent): void {
  result.newImpactEvents.push(event);
  result.newState.impactEventIds.push(event.id);
}

function mergeClaims(claims: Claim[]): Claim | null {
  const [firstClaim, ...remainingClaims] = claims;
  if (firstClaim == null) {
    return null;
  }

  return remainingClaims.reduce<Claim>(
    (merged, claim) => ({
      entity: claim.entity,
      effect: mergeClaimEffect(merged.effect, claim.effect),
      scopes: {
        service: claim.scopes.service ?? merged.scopes.service,
      },
      statusSignal: claim.statusSignal ?? merged.statusSignal,
      timeHints: claim.timeHints ?? merged.timeHints,
      causes: claim.causes ?? merged.causes,
    }),
    firstClaim,
  );
}

function mergeClaimEffect(
  current: Claim['effect'],
  next: Claim['effect'],
): Claim['effect'] {
  if (next == null) {
    return current;
  }
  if (current == null) {
    return next;
  }
  return {
    service: next.service ?? current.service,
    facility: next.facility ?? current.facility,
  };
}

type ReconcilePeriodsWithTimeHintsResults = {
  newPeriods: Period[];
  hasChanged: boolean;
};

/**
 * Reconcile the periods with the time hints.
 * @param currentPeriods - The current periods.
 * @param timeHints - The time hints.
 * @returns The new periods and whether the periods have changed.
 */
function reconcilePeriodsWithTimeHints(
  currentPeriods: Period[],
  timeHints: ClaimTimeHints,
): ReconcilePeriodsWithTimeHintsResults {
  switch (timeHints.kind) {
    case 'fixed': {
      const newPeriods = mergeFixedPeriods(currentPeriods, timeHints);
      return {
        newPeriods,
        hasChanged: !isEqual(newPeriods, currentPeriods),
      };
    }
    case 'recurring': {
      const newPeriods = [timeHints];
      return {
        newPeriods,
        hasChanged: !isEqual(newPeriods, currentPeriods),
      };
    }
    case 'start-only': {
      if (currentPeriods.length === 0) {
        return {
          newPeriods: [
            { kind: 'fixed', startAt: timeHints.startAt, endAt: null },
          ],
          hasChanged: true,
        };
      }
      // Fixed periods only move earlier, but recurring periods should realign
      // to the explicit anchor carried by the newest claim.
      let hasChanged = false;
      const newPeriods: Period[] = [];
      for (const period of currentPeriods) {
        switch (period.kind) {
          case 'fixed': {
            if (timeHints.startAt < period.startAt) {
              newPeriods.push({ ...period, startAt: timeHints.startAt });
              hasChanged = true;
            } else {
              newPeriods.push(period);
            }
            break;
          }
          case 'recurring': {
            if (timeHints.startAt !== period.startAt) {
              const newPeriod: Period = {
                ...period,
                startAt: timeHints.startAt,
              };
              if (newPeriod.timeWindow != null) {
                const startAt = DateTime.fromISO(timeHints.startAt, {
                  setZone: true,
                });
                assert(startAt.isValid);
                newPeriod.timeWindow.startAt = startAt.toFormat('HH:mm:ss');
              }
              newPeriods.push(newPeriod);
              hasChanged = true;
            } else {
              newPeriods.push(period);
            }
            break;
          }
        }
      }
      return { newPeriods, hasChanged };
    }
    case 'end-only': {
      const newPeriods: Period[] = [];
      for (const period of currentPeriods) {
        switch (period.kind) {
          case 'fixed': {
            // Only close open-ended periods; never move endAt backwards on an
            // already-closed period (that would reverse startAt/endAt order).
            if (period.endAt == null) {
              newPeriods.push({ ...period, endAt: timeHints.endAt });
            } else {
              newPeriods.push(period);
            }
            break;
          }
          case 'recurring': {
            const newPeriod: Period = {
              ...period,
              endAt: timeHints.endAt,
            };
            if (newPeriod.timeWindow != null) {
              const endAt = DateTime.fromISO(timeHints.endAt, {
                setZone: true,
              });
              assert(endAt.isValid);
              newPeriod.timeWindow.endAt = endAt.toFormat('HH:mm:ss');
            }
            newPeriods.push(newPeriod);
            break;
          }
        }
      }
      return {
        newPeriods,
        hasChanged: !isEqual(newPeriods, currentPeriods),
      };
    }
  }
}

function mergeFixedPeriods(
  currentPeriods: Period[],
  nextPeriod: Extract<ClaimTimeHints, { kind: 'fixed' }>,
): Period[] {
  const recurringPeriods = currentPeriods.filter(
    (period): period is Extract<Period, { kind: 'recurring' }> =>
      period.kind === 'recurring',
  );
  const fixedPeriods = currentPeriods
    .filter(
      (period): period is Extract<Period, { kind: 'fixed' }> =>
        period.kind === 'fixed',
    )
    .concat(nextPeriod)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  const mergedFixedPeriods: Extract<Period, { kind: 'fixed' }>[] = [];
  for (const period of fixedPeriods) {
    const previous = mergedFixedPeriods.at(-1);
    if (previous == null) {
      mergedFixedPeriods.push({ ...period });
      continue;
    }

    if (!fixedPeriodsOverlap(previous, period)) {
      mergedFixedPeriods.push({ ...period });
      continue;
    }

    previous.startAt =
      previous.startAt < period.startAt ? previous.startAt : period.startAt;
    previous.endAt = mergeFixedEndAt(previous.endAt, period.endAt);
  }

  return [...mergedFixedPeriods, ...recurringPeriods];
}

function mergeFixedEndAt(
  currentEndAt: string | null,
  nextEndAt: string | null,
): string | null {
  if (currentEndAt == null || nextEndAt == null) {
    return null;
  }
  return currentEndAt > nextEndAt ? currentEndAt : nextEndAt;
}

function fixedPeriodsOverlap(
  left: Extract<Period, { kind: 'fixed' }>,
  right: Extract<Period, { kind: 'fixed' }>,
): boolean {
  if (left.endAt == null) {
    return true;
  }
  return left.endAt >= right.startAt;
}

function isEqual(a: unknown, b: unknown): boolean {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

/**
 * If a `fixed` time hint has an open-ended period (`endAt = null`) whose
 * `startAt` is in the future relative to the evidence timestamp, clamp
 * `startAt` to the evidence timestamp.
 *
 * Pre-announcement evidence typically states a future start date without a
 * known end. Letting `startAt > evidenceTs` with `endAt = null` would produce
 * a zero-duration operational window (resolvePeriods clamps the inferred end
 * to at least `startAt`). Using the evidence timestamp as the anchor instead
 * means "this disruption is flagged as of the announcement" — later evidence
 * with actual schedules will supersede it.
 */
function clampTimeHintsToEvidenceTs(
  hints: ClaimTimeHints,
  evidenceTs: string,
): ClaimTimeHints {
  if (
    hints.kind === 'fixed' &&
    hints.endAt == null &&
    hints.startAt > evidenceTs
  ) {
    return { kind: 'fixed', startAt: evidenceTs, endAt: null };
  }
  return hints;
}
