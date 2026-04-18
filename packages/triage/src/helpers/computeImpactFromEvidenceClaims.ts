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

  const claimsKeyedByAffectedEntity: Record<string, Claim> = Object.fromEntries(
    params.claims.map((claim) => [keyForAffectedEntity(claim.entity), claim]),
  );

  for (const [key, claim] of Object.entries(claimsKeyedByAffectedEntity)) {
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

        // A service must have (or be establishing) a period before effects,
        // scopes, or causes can be recorded for it. Without a period, the
        // service is not participating in the issue and any attribute update
        // would be orphaned.
        if (currentServiceState.periods.length === 0 && claim.timeHints == null) {
          continue;
        }

        if (
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

        if (claim.timeHints != null) {
          const { newPeriods, hasChanged } = reconcilePeriodsWithTimeHints(
            currentServiceState.periods,
            clampTimeHintsToEvidenceTs(claim.timeHints, eventTs),
          );
          if (hasChanged) {
            currentServiceState.periods = newPeriods;
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
        }

        if (
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

        if (claim.timeHints != null) {
          const { newPeriods, hasChanged } = reconcilePeriodsWithTimeHints(
            currentFacilityState.periods,
            clampTimeHintsToEvidenceTs(claim.timeHints, eventTs),
          );
          if (hasChanged) {
            currentFacilityState.periods = newPeriods;
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
      // Only move startAt to an earlier value; never advance it.
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
            if (timeHints.startAt < period.startAt) {
              const newPeriod: Period = { ...period, startAt: timeHints.startAt };
              if (newPeriod.timeWindow != null) {
                const startAt = DateTime.fromISO(timeHints.startAt);
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
              const endAt = DateTime.fromISO(timeHints.endAt);
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
  if (
    currentPeriods.length !== 1 ||
    currentPeriods[0]?.kind !== 'fixed' ||
    currentPeriods[0].endAt != null &&
      currentPeriods[0].endAt < nextPeriod.startAt
  ) {
    return [nextPeriod];
  }

  const currentPeriod = currentPeriods[0];
  const endAt = mergeFixedEndAt(currentPeriod.endAt, nextPeriod.endAt);
  return [
    {
      kind: 'fixed',
      startAt:
        currentPeriod.startAt < nextPeriod.startAt
          ? currentPeriod.startAt
          : nextPeriod.startAt,
      endAt,
    },
  ];
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

function isEqual(a: unknown, b: unknown): boolean {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch (error) {
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
