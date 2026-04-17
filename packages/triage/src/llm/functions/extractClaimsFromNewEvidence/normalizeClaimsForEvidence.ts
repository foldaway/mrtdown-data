import type { Claim } from '@mrtdown/core';
import {
  evidenceDescribesCurrentDegradedService,
  evidenceMentionsVagueFutureSuspension,
} from './degradedServiceHeuristics.js';

export function normalizeClaimsForEvidence(params: {
  claims: Claim[];
  evidenceText: string;
  evidenceTs: string;
}): Claim[] {
  if (!evidenceDescribesCurrentDegradedService(params.evidenceText)) {
    return params.claims;
  }

  const evidenceTsMs = Date.parse(params.evidenceTs);
  const hasVagueFutureSuspension = evidenceMentionsVagueFutureSuspension(
    params.evidenceText,
  );

  return params.claims.map((claim) => {
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
