import { deepStrictEqual } from 'node:assert';
import type {
  Claim,
  ClaimStatusSignal,
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
  const result: Result = {
    newState: {
      services: {},
      servicesProvenance: {},
      facilities: {},
      facilitiesProvenance: {},
      impactEventIds: [],
    },
    newImpactEvents: [],
  };

  const eventTs = params.evidenceTs;
  const eventDateTime = DateTime.fromISO(eventTs);
  assert(eventDateTime.isValid, `Invalid date: ${eventTs}`);

  const currentState = deriveCurrentState(params.issueBundle);

  const claimsByAffectedEntity = new Map<string, Claim[]>();
  for (const claim of params.claims) {
    const key = keyForAffectedEntity(claim.entity);
    const current = claimsByAffectedEntity.get(key) ?? [];
    current.push(claim);
    claimsByAffectedEntity.set(key, current);
  }

  for (const [key, claims] of claimsByAffectedEntity) {
    const claim = claims.at(-1);
    if (claim == null) {
      continue;
    }

    switch (claim.entity.type) {
      case 'service': {
        const currentServiceState = currentState.services[key] ?? {
          effect: null,
          scopes: [],
          periods: [],
          causes: [],
        };
        const currentServiceProvenance =
          currentState.servicesProvenance[key] ?? {};

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
          result.newImpactEvents.push({
            id: IdGenerator.impactEventId(eventDateTime),
            type: 'service_effects.set',
            ts: eventTs,
            basis: { evidenceId: params.evidenceId },
            entity: claim.entity,
            effect: claim.effect.service,
          });
        }

        switch (params.issueBundle.issue.type) {
          case 'disruption': {
            const isCleared = currentServiceState.periods.every(
              (period) => period.kind === 'fixed' && period.endAt != null,
            );

            let currentStatus: ClaimStatusSignal = 'open';

            if (isCleared) {
              currentStatus = 'cleared';
            }

            if (currentStatus !== claim.statusSignal) {
              switch (claim.statusSignal) {
                case 'open': {
                  break;
                }
                case 'cleared': {
                  break;
                }
              }
            }
            break;
          }
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
          result.newImpactEvents.push({
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
          result.newImpactEvents.push({
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
          result.newImpactEvents.push({
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
        const currentFacilityState = currentState.facilities[key] ?? {
          effect: null,
          periods: [],
        };
        const currentFacilityProvenance =
          currentState.facilitiesProvenance[key] ?? {};

        if (
          claim.effect?.facility != null &&
          !isEqual(currentFacilityState.effect, claim.effect.facility)
        ) {
          currentFacilityState.effect = claim.effect.facility;
          currentFacilityProvenance.effect = {
            evidenceId: params.evidenceId,
          };
          result.newImpactEvents.push({
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
          result.newImpactEvents.push({
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
          result.newImpactEvents.push({
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
            newPeriods: [{ kind: 'fixed', startAt: timeHints.startAt, endAt: null }],
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
              const newPeriod: Period = { ...period, startAt: timeHints.startAt };
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
              const endAt = DateTime.fromISO(timeHints.endAt, { setZone: true });
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
    return currentEndAt ?? nextEndAt;
  }
  return currentEndAt > nextEndAt ? currentEndAt : nextEndAt;
}

function fixedPeriodsOverlap(
  left: Extract<Period, { kind: 'fixed' }>,
  right: Extract<Period, { kind: 'fixed' }>,
): boolean {
  if (left.endAt == null || right.endAt == null) {
    return left.startAt <= right.startAt;
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
  if (hints.kind === 'fixed' && hints.endAt == null && hints.startAt > evidenceTs) {
    return { kind: 'fixed', startAt: evidenceTs, endAt: null };
  }
  return hints;
}
