import type { ImpactEvent } from '@mrtdown/core';
import { keyForAffectedEntity } from '../../../helpers/keyForAffectedEntity.js';

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

export function evidenceDescribesCurrentDegradedService(text: string): boolean {
  return (
    CURRENT_DEGRADED_SERVICE_PATTERNS.some((pattern) => pattern.test(text)) &&
    !CURRENT_NO_SERVICE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function evidenceMentionsVagueFutureSuspension(
  text: string,
): boolean {
  return VAGUE_FUTURE_SUSPENSION_PATTERNS.some((pattern) => pattern.test(text));
}

export function evidenceMatchesDegradedFutureSuspensionPattern(
  text: string,
): boolean {
  return (
    evidenceDescribesCurrentDegradedService(text) &&
    evidenceMentionsVagueFutureSuspension(text)
  );
}

export function impactEventsMatchFutureNoServiceMisclassification(params: {
  impactEvents: ImpactEvent[];
  evidenceTs: string;
}): boolean {
  const evidenceTsMs = Date.parse(params.evidenceTs);
  const entityState = new Map<
    string,
    { hasNoService: boolean; hasFutureFixedPeriod: boolean }
  >();

  for (const event of params.impactEvents) {
    const entityKey = keyForAffectedEntity(event.entity);
    const current = entityState.get(entityKey) ?? {
      hasNoService: false,
      hasFutureFixedPeriod: false,
    };

    if (
      event.type === 'service_effects.set' &&
      event.effect.kind === 'no-service'
    ) {
      current.hasNoService = true;
    }

    if (event.type === 'periods.set') {
      current.hasFutureFixedPeriod = event.periods.some(
        (period) =>
          period.kind === 'fixed' &&
          Date.parse(period.startAt) > evidenceTsMs &&
          period.endAt != null,
      );
    }

    entityState.set(entityKey, current);
  }

  return [...entityState.values()].some(
    ({ hasNoService, hasFutureFixedPeriod }) =>
      hasNoService && hasFutureFixedPeriod,
  );
}
