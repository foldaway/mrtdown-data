import type { Claim, Service } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';

const DAYS_OF_WEEK = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export function normalizeClaimsForEvidence(params: {
  claims: Claim[];
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  const fieldNormalizedClaims = normalizeClaimFields(params.claims);
  const activeServiceClaims = filterInactiveServiceClaims({
    claims: fieldNormalizedClaims,
    evidenceTs: params.evidenceTs,
    repo: params.repo,
  });
  const completedClaims = synthesizeWholeLineSiblingServiceClaims({
    claims: activeServiceClaims,
    evidenceTs: params.evidenceTs,
    repo: params.repo,
  });

  return dedupeClaims(
    normalizeClaimFields(
      ensureServiceImpactClaimsHavePeriodAnchors(
        completedClaims,
        params.evidenceTs,
      ),
    ),
  );
}

function filterInactiveServiceClaims(params: {
  claims: Claim[];
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  if (params.repo == null || typeof params.repo.services.get !== 'function') {
    return params.claims;
  }

  return params.claims.filter((claim) => {
    if (claim.entity.type !== 'service') {
      return true;
    }

    const service = params.repo?.services.get(claim.entity.serviceId);
    return service == null || isServiceActiveAt(service, params.evidenceTs);
  });
}

function normalizeClaimFields(claims: Claim[]): Claim[] {
  return claims.map((claim) => {
    const causes =
      claim.causes != null && claim.causes.length === 0 ? null : claim.causes;
    const effect = {
      service: claim.effect?.service ?? null,
      facility: claim.effect?.facility ?? null,
    };
    const timeHints = normalizeTimeHints(claim.timeHints);

    return causes === claim.causes &&
      effect === claim.effect &&
      timeHints === claim.timeHints
      ? claim
      : { ...claim, effect, timeHints, causes };
  });
}

function normalizeTimeHints(claim: Claim['timeHints']): Claim['timeHints'] {
  if (
    claim?.kind !== 'recurring' ||
    claim.frequency !== 'daily' ||
    claim.daysOfWeek == null
  ) {
    return claim;
  }

  const uniqueDaysOfWeek = new Set(claim.daysOfWeek);
  const coversEveryDay =
    uniqueDaysOfWeek.size === 7 &&
    DAYS_OF_WEEK.every((day) => uniqueDaysOfWeek.has(day));

  return coversEveryDay ? { ...claim, daysOfWeek: null } : claim;
}

function ensureServiceImpactClaimsHavePeriodAnchors(
  claims: Claim[],
  evidenceTs: string,
): Claim[] {
  return claims.map((claim) => {
    if (claim.entity.type !== 'service') {
      return claim;
    }

    const serviceEffect = claim.effect?.service;
    if (
      serviceEffect == null ||
      claim.timeHints != null ||
      claim.statusSignal === 'cleared'
    ) {
      return claim;
    }

    return {
      ...claim,
      timeHints: {
        kind: 'start-only',
        startAt: evidenceTs,
      },
    };
  });
}

function synthesizeWholeLineSiblingServiceClaims(params: {
  claims: Claim[];
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  if (params.repo == null) {
    return params.claims;
  }

  if (typeof params.repo.services.get !== 'function') {
    return params.claims;
  }

  const serviceClaims = params.claims.filter(isServiceClaim).filter((claim) => {
    return (
      claim.effect?.service != null &&
      (claim.scopes.service == null ||
        claim.scopes.service.every((scope) => scope.type === 'service.whole'))
    );
  });
  if (serviceClaims.length === 0) {
    return params.claims;
  }

  const claimsByLineId = new Map<
    string,
    Array<Claim & { entity: Extract<Claim['entity'], { type: 'service' }> }>
  >();
  for (const claim of serviceClaims) {
    const service = params.repo.services.get(claim.entity.serviceId);
    if (service == null) continue;
    const current = claimsByLineId.get(service.lineId) ?? [];
    current.push(claim);
    claimsByLineId.set(service.lineId, current);
  }

  const synthesizedClaims: Claim[] = [];
  for (const [lineId, lineClaims] of claimsByLineId) {
    const activeServices = params.repo.services
      .searchByLineId(lineId)
      .filter((service) => isServiceActiveAt(service, params.evidenceTs));
    const activeServiceIds = new Set(
      activeServices.map((service) => service.id),
    );
    const activeLineClaims = lineClaims.filter((claim) =>
      activeServiceIds.has(claim.entity.serviceId),
    );
    const existingActiveServiceIds = new Set(
      activeLineClaims.map((claim) => claim.entity.serviceId),
    );
    if (existingActiveServiceIds.size < 2) {
      continue;
    }

    const templateKeys = new Set(
      activeLineClaims.map((claim) =>
        stableJson({
          effect: claim.effect,
          scopes: claim.scopes,
          statusSignal: claim.statusSignal,
          timeHints: claim.timeHints,
          causes: claim.causes,
        }),
      ),
    );
    if (templateKeys.size !== 1) {
      continue;
    }

    const missingServices = activeServices.filter(
      (service) => !existingActiveServiceIds.has(service.id),
    );
    if (missingServices.length === 0) {
      continue;
    }

    const [template] = activeLineClaims;
    if (template == null) {
      continue;
    }

    synthesizedClaims.push(
      ...missingServices.map((service) => ({
        ...template,
        entity: {
          type: 'service' as const,
          serviceId: service.id,
        },
      })),
    );
  }

  return dedupeClaims([...params.claims, ...synthesizedClaims]);
}

function isServiceClaim(
  claim: Claim,
): claim is Claim & { entity: Extract<Claim['entity'], { type: 'service' }> } {
  return claim.entity.type === 'service';
}

function isServiceActiveAt(service: Service, evidenceTs: string): boolean {
  const evidenceTsMs = Date.parse(evidenceTs);
  return service.revisions.some((revision) => {
    const startedAtMs = singaporeServiceDateTimestamp(revision.startAt);
    const endedAtMs =
      revision.endAt == null
        ? null
        : singaporeServiceDateTimestamp(revision.endAt);
    return (
      startedAtMs <= evidenceTsMs &&
      (endedAtMs == null || endedAtMs > evidenceTsMs)
    );
  });
}

function singaporeServiceDateTimestamp(value: string): number {
  return Date.parse(`${value}T00:00:00+08:00`);
}

function dedupeClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const deduped: Claim[] = [];

  for (const claim of claims) {
    const key = stableJson(claim);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(claim);
  }

  return deduped;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableJson(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
