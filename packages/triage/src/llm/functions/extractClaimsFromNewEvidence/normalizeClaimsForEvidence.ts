import type { Claim, Service, Station } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import {
  evidenceDescribesCurrentDegradedService,
  evidenceMentionsVagueFutureSuspension,
} from './degradedServiceHeuristics.js';

export function normalizeClaimsForEvidence(params: {
  claims: Claim[];
  evidenceText: string;
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  const claims = filterClaimsByMentionedStations(params);

  if (!evidenceDescribesCurrentDegradedService(params.evidenceText)) {
    return claims;
  }

  const evidenceTsMs = Date.parse(params.evidenceTs);
  const hasVagueFutureSuspension = evidenceMentionsVagueFutureSuspension(
    params.evidenceText,
  );

  return claims.map((claim) => {
    const serviceEffect = claim.effect?.service;

    if (
      serviceEffect == null ||
      (serviceEffect.kind !== 'no-service' &&
        serviceEffect.kind !== 'reduced-service')
    ) {
      return claim;
    }

    let nextClaim: Claim = claim;

    if (serviceEffect.kind === 'no-service') {
      nextClaim = {
        ...nextClaim,
        effect: {
          service: { kind: 'reduced-service' },
          facility: nextClaim.effect?.facility ?? null,
        },
      };
    }

    if (nextClaim.statusSignal !== 'cleared') {
      nextClaim = {
        ...nextClaim,
        statusSignal: 'open',
      };
    }

    const shouldPreferCurrentStartOnly =
      nextClaim.timeHints == null ||
      (nextClaim.timeHints.kind === 'fixed' &&
        (Date.parse(nextClaim.timeHints.startAt) > evidenceTsMs ||
          hasVagueFutureSuspension)) ||
      (nextClaim.timeHints.kind === 'start-only' &&
        Date.parse(nextClaim.timeHints.startAt) > evidenceTsMs);

    if (shouldPreferCurrentStartOnly) {
      nextClaim = {
        ...nextClaim,
        timeHints: {
          kind: 'start-only',
          startAt: params.evidenceTs,
        },
      };
    }

    return nextClaim;
  });
}

function filterClaimsByMentionedStations(params: {
  claims: Claim[];
  evidenceText: string;
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  if (params.repo == null) {
    return params.claims;
  }

  const serviceClaims = params.claims.filter(isServiceClaim);
  if (serviceClaims.length < 2) {
    return params.claims;
  }

  const mentionedStationIds = collectMentionedStationIds(
    params.evidenceText,
    params.evidenceTs,
    params.repo,
  );
  if (mentionedStationIds.size === 0) {
    return params.claims;
  }

  const servicesById = new Map<string, Service>();
  for (const claim of serviceClaims) {
    const service = params.repo.services.get(claim.entity.serviceId);
    if (service != null) {
      servicesById.set(service.id, service);
    }
  }

  const serviceIdsToDrop = new Set<string>();
  const claimsByLineId = new Map<
    string,
    Array<Claim & { entity: Extract<Claim['entity'], { type: 'service' }> }>
  >();
  for (const claim of serviceClaims) {
    const service = servicesById.get(claim.entity.serviceId);
    if (service == null) continue;
    const current = claimsByLineId.get(service.lineId) ?? [];
    current.push(claim);
    claimsByLineId.set(service.lineId, current);
  }

  for (const lineClaims of claimsByLineId.values()) {
    if (lineClaims.length < 2) continue;
    if (
      !lineClaims.every((claim) =>
        claim.scopes.service == null ||
        claim.scopes.service.every((scope) => scope.type === 'service.whole'),
      )
    ) {
      continue;
    }

    const overlapByServiceId = new Map<string, boolean>();
    for (const claim of lineClaims) {
      const service = servicesById.get(claim.entity.serviceId);
      if (service == null) continue;

      const stationIds = getActiveServiceStationIds(service, params.evidenceTs);
      overlapByServiceId.set(
        service.id,
        stationIds.some((stationId) => mentionedStationIds.has(stationId)),
      );
    }

    const hasOverlap = [...overlapByServiceId.values()].some(Boolean);
    const hasNonOverlap = [...overlapByServiceId.values()].some(
      (overlap) => !overlap,
    );
    if (!hasOverlap || !hasNonOverlap) {
      continue;
    }

    for (const [serviceId, overlap] of overlapByServiceId) {
      if (!overlap) {
        serviceIdsToDrop.add(serviceId);
      }
    }
  }

  if (serviceIdsToDrop.size === 0) {
    return params.claims;
  }

  return params.claims.filter(
    (claim) =>
      claim.entity.type !== 'service' ||
      !serviceIdsToDrop.has(claim.entity.serviceId),
  );
}

function isServiceClaim(
  claim: Claim,
): claim is Claim & { entity: Extract<Claim['entity'], { type: 'service' }> } {
  return claim.entity.type === 'service';
}

function collectMentionedStationIds(
  evidenceText: string,
  evidenceTs: string,
  repo: MRTDownRepository,
): Set<string> {
  const normalizedEvidenceText = normalizeSearchText(evidenceText);
  const mentionedStationIds = new Set<string>();

  for (const station of repo.stations.list()) {
    if (
      stationMatchesEvidence(station, evidenceTs, normalizedEvidenceText)
    ) {
      mentionedStationIds.add(station.id);
    }
  }

  return mentionedStationIds;
}

function stationMatchesEvidence(
  station: Station,
  evidenceTs: string,
  normalizedEvidenceText: string,
): boolean {
  if (
    containsNormalizedPhrase(normalizedEvidenceText, station.id) ||
    containsNormalizedPhrase(normalizedEvidenceText, station.name['en-SG'])
  ) {
    return true;
  }

  const evidenceTsMs = Date.parse(evidenceTs);
  return station.stationCodes.some((stationCode) => {
    const startedAtMs = Date.parse(stationCode.startedAt);
    const endedAtMs =
      stationCode.endedAt == null ? null : Date.parse(stationCode.endedAt);
    if (startedAtMs > evidenceTsMs) return false;
    if (endedAtMs != null && endedAtMs < evidenceTsMs) return false;
    return containsNormalizedPhrase(normalizedEvidenceText, stationCode.code);
  });
}

function getActiveServiceStationIds(
  service: Service,
  evidenceTs: string,
): string[] {
  const evidenceTsMs = Date.parse(evidenceTs);
  const revision =
    [...service.revisions]
      .reverse()
      .find((candidate) => {
        const startedAtMs = Date.parse(candidate.startAt);
        const endedAtMs =
          candidate.endAt == null ? null : Date.parse(candidate.endAt);
        return (
          startedAtMs <= evidenceTsMs &&
          (endedAtMs == null || endedAtMs > evidenceTsMs)
        );
      }) ?? service.revisions.at(-1);

  return revision?.path.stations.map((station) => station.stationId) ?? [];
}

function containsNormalizedPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeSearchText(phrase).trim();
  return normalizedPhrase.length > 0
    ? haystack.includes(` ${normalizedPhrase} `)
    : false;
}

function normalizeSearchText(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}
