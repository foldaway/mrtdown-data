import type {
  CauseSubtype,
  FacilityEffect,
  IssueBundle,
  Period,
  ServiceEffect,
  ServiceScope,
} from '@mrtdown/core';
import { keyForAffectedEntity } from './keyForAffectedEntity.js';

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
  lineId?: string | null;
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
  const activeImpactEventIds = new Map<string, string>();
  const impactEventIds = new Set<string>();

  function trackImpactEventId(stateKey: string, eventId: string): void {
    const previousId = activeImpactEventIds.get(stateKey);
    if (previousId != null) {
      impactEventIds.delete(previousId);
    }

    activeImpactEventIds.set(stateKey, eventId);
    impactEventIds.add(eventId);
  }

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
            trackImpactEventId(`${key}:serviceEffect`, impactEvent.id);
            break;
          }
          case 'periods.set': {
            currentState.periods = impactEvent.periods;
            currentProvenance.periods = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:periods`, impactEvent.id);
            break;
          }
          case 'service_scopes.set': {
            currentState.scopes = impactEvent.serviceScopes;
            currentProvenance.scopes = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:serviceScopes`, impactEvent.id);
            break;
          }
          case 'causes.set': {
            currentState.causes = impactEvent.causes;
            currentProvenance.causes = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:causes`, impactEvent.id);
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
          lineId: impactEvent.entity.lineId ?? null,
          kind: impactEvent.entity.kind,
          effect: null,
          periods: [],
          causes: [],
        };

        const currentProvenance = facilitiesProvenance[key] ?? {};

        switch (impactEvent.type) {
          case 'facility_effects.set': {
            currentState.effect = impactEvent.effect;
            currentProvenance.effect = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:facilityEffect`, impactEvent.id);
            break;
          }
          case 'periods.set': {
            currentState.periods = impactEvent.periods;
            currentProvenance.periods = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:periods`, impactEvent.id);
            break;
          }
          case 'causes.set': {
            currentState.causes = impactEvent.causes;
            currentProvenance.causes = {
              evidenceId: impactEvent.basis.evidenceId,
            };
            trackImpactEventId(`${key}:causes`, impactEvent.id);
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
    impactEventIds: [...impactEventIds],
  };
}
