import type { Claim } from '@mrtdown/core';

const CURRENT_DEGRADED_SERVICE_PATTERNS = [
  /\blonger waits?\b/i,
  /\bwaits? of up to\b/i,
  /\bheadways? adjusted\b/i,
  /\badditional travel time\b/i,
  /\bsingle[- ]loop operation\b/i,
  /\breduced frequency\b/i,
  /\btrains? .* longer intervals\b/i,
];

const CURRENT_NO_SERVICE_PATTERNS = [
  /\bno train service\b/i,
  /\bno trains? (?:are )?running\b/i,
  /\btrain services? (?:is|are|has been|have been)\s+(?:suspended|closed)\b/i,
  /\bservice (?:is|are|has been|have been)\s+(?:suspended|closed)\b/i,
];

const VAGUE_FUTURE_SUSPENSION_PATTERNS = [
  /\bplanned\b/i,
  /\bexpected\b/i,
  /\bfirst half of \d{4}\b/i,
  /\bsecond half of \d{4}\b/i,
  /\blater this year\b/i,
  /\bnext year\b/i,
];

function evidenceDescribesCurrentDegradedService(text: string): boolean {
  return (
    CURRENT_DEGRADED_SERVICE_PATTERNS.some((pattern) => pattern.test(text)) &&
    !CURRENT_NO_SERVICE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function evidenceMentionsOnlyVagueFutureSuspension(text: string): boolean {
  return VAGUE_FUTURE_SUSPENSION_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeClaimsForEvidence(params: {
  claims: Claim[];
  evidenceText: string;
  evidenceTs: string;
}): Claim[] {
  if (!evidenceDescribesCurrentDegradedService(params.evidenceText)) {
    return params.claims;
  }

  const evidenceTsMs = Date.parse(params.evidenceTs);
  const hasVagueFutureSuspension = evidenceMentionsOnlyVagueFutureSuspension(
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
