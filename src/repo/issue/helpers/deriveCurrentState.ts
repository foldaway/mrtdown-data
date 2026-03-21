import { keyForAffectedEntity } from '../../../helpers/keyForAffectedEntity.js';
import type { IssueBundle } from '../../../schema/issue/bundle.js';
import type { CauseSubtype } from '../../../schema/issue/cause.js';
import type { FacilityEffect } from '../../../schema/issue/facilityEffect.js';
import type { Period } from '../../../schema/issue/period.js';
import type { ServiceEffect } from '../../../schema/issue/serviceEffect.js';
import type { ServiceScope } from '../../../schema/issue/serviceScope.js';

type BasisRef = {
  evidenceId: string;
};

type ServiceProvenance = {
  effect?: BasisRef;
  scopes?: BasisRef;
  periods?: BasisRef;
  causes?: BasisRef;
};

type ServiceState = {
  serviceId: string;
  effect: ServiceEffect | null;
  scopes: ServiceScope[];
  periods: Period[];
  causes: CauseSubtype[];
};

type FacilityProvenance = {
  effect?: BasisRef;
  periods?: BasisRef;
  causes?: BasisRef;
};

type FacilityState = {
  stationId: string;
  kind: 'lift' | 'escalator' | 'screen-door';
  effect: FacilityEffect | null;
  periods: Period[];
  causes: CauseSubtype[];
};

export type IssueBundleState = {
  services: Record<string, ServiceState>;
  servicesProvenance: Record<string, ServiceProvenance>;
  facilities: Record<string, FacilityState>;
  facilitiesProvenance: Record<string, FacilityProvenance>;
  /**
   * The impact event ids that were used to derive the current state.
   */
  impactEventIds: string[];
};

/**
 * Derive the current state of an issue.
 * @param bundle
 * @returns
 */
export function deriveCurrentState(bundle: IssueBundle): IssueBundleState {
  const services: Record<string, ServiceState> = {};
  const servicesProvenance: Record<string, ServiceProvenance> = {};
  const facilities: Record<string, FacilityState> = {};
  const facilitiesProvenance: Record<string, FacilityProvenance> = {};
  const impactEventIds: {
    serviceEffect: string | null;
    serviceScopes: string | null;
    periods: string | null;
    causes: string | null;
    facilityEffect: string | null;
  } = {
    serviceEffect: null,
    serviceScopes: null,
    periods: null,
    causes: null,
    facilityEffect: null,
  };

  for (const impactEvent of bundle.impactEvents) {
    const key = keyForAffectedEntity(impactEvent.entity);

    switch (impactEvent.entity.type) {
      case 'service': {
        const currentState = services[key] ?? {
          serviceId: impactEvent.entity.serviceId,
          effect: null,
          scopes: [],
          periods: [],
          causes: [],
        };

        const currentProvenance = servicesProvenance[key] ?? {};

        switch (impactEvent.type) {
          case 'service_effects.set': {
            currentState.effect = impactEvent.effect;
            currentProvenance.effect = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.serviceEffect = impactEvent.id;
            break;
          }
          case 'periods.set': {
            currentState.periods = impactEvent.periods;
            currentProvenance.periods = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.periods = impactEvent.id;
            break;
          }
          case 'service_scopes.set': {
            currentState.scopes = impactEvent.serviceScopes;
            currentProvenance.scopes = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.serviceScopes = impactEvent.id;
            break;
          }
          case 'causes.set': {
            currentState.causes = impactEvent.causes;
            currentProvenance.causes = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.causes = impactEvent.id;
            break;
          }
        }

        services[key] = currentState;
        servicesProvenance[key] = currentProvenance;

        break;
      }
      case 'facility': {
        const currentState = facilities[key] ?? {
          stationId: impactEvent.entity.stationId,
          kind: impactEvent.entity.kind,
          effect: null,
          periods: [],
        };

        const currentProvenance = facilitiesProvenance[key] ?? {};

        switch (impactEvent.type) {
          case 'facility_effects.set': {
            currentState.effect = impactEvent.effect;
            currentProvenance.effect = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.facilityEffect = impactEvent.id;
            break;
          }
          case 'periods.set': {
            currentState.periods = impactEvent.periods;
            currentProvenance.periods = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            impactEventIds.periods = impactEvent.id;
            break;
          }
        }

        facilities[key] = currentState;
        facilitiesProvenance[key] = currentProvenance;

        break;
      }
      default: {
        // @ts-expect-error fallback case
        throw new Error(`Unknown entity type: ${impactEvent.entity.type}`);
      }
    }
  }

  return {
    services,
    servicesProvenance,
    facilities,
    facilitiesProvenance,
    impactEventIds: Object.values(impactEventIds).filter(
      (id): id is string => id !== null,
    ),
  };
}
