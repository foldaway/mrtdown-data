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
            claim.timeHints,
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
            claim.timeHints,
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
      return {
        newPeriods: [timeHints],
        hasChanged: true,
      };
    }
    case 'recurring': {
      return {
        newPeriods: [timeHints],
        hasChanged: true,
      };
    }
    case 'start-only': {
      let hasChanged = false;
      const newPeriods: Period[] = [];
      if (currentPeriods.length === 0) {
        newPeriods.push({
          kind: 'fixed',
          startAt: timeHints.startAt,
          endAt: null,
        });
        hasChanged = true;
        return { newPeriods, hasChanged };
      }
      for (const period of currentPeriods) {
        switch (period.kind) {
          case 'fixed': {
            newPeriods.push({
              ...period,
              startAt: timeHints.startAt,
            });
            hasChanged = true;
            break;
          }
          case 'recurring': {
            const newPeriod: Period = {
              ...period,
              startAt: timeHints.startAt,
            };
            if (newPeriod.timeWindow != null) {
              const startAt = DateTime.fromISO(timeHints.startAt);
              assert(startAt.isValid);
              newPeriod.timeWindow.startAt = startAt.toFormat('HH:mm:ss');
            }
            newPeriods.push(newPeriod);
            hasChanged = true;
            break;
          }
        }
      }
      return {
        newPeriods,
        hasChanged,
      };
    }
    case 'end-only': {
      let hasChanged = false;
      const newPeriods: Period[] = [];
      for (const period of currentPeriods) {
        switch (period.kind) {
          case 'fixed': {
            newPeriods.push({
              ...period,
              endAt: timeHints.endAt,
            });
            hasChanged = true;
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
            hasChanged = true;
            break;
          }
        }
      }
      return {
        newPeriods,
        hasChanged,
      };
    }
  }
}

function isEqual(a: unknown, b: unknown): boolean {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch (error) {
    return false;
  }
}
