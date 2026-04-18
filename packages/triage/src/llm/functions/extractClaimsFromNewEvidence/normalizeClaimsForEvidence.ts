import type { Claim, Service, Station } from '@mrtdown/core';
import type { MRTDownRepository } from '@mrtdown/fs';
import { DateTime } from 'luxon';
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
  const claims = synthesizeWholeLineClosureClaims({
    ...params,
    claims: filterClaimsByMentionedStations(params),
  });

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

function synthesizeWholeLineClosureClaims(params: {
  claims: Claim[];
  evidenceText: string;
  evidenceTs: string;
  repo?: MRTDownRepository;
}): Claim[] {
  if (params.repo == null) {
    return params.claims;
  }

  if (!evidenceDescribesExplicitWholeLineClosure(params.evidenceText)) {
    return params.claims;
  }

  const lineIds = collectMentionedLineIds(params.evidenceText, params.repo);
  if (lineIds.length !== 1) {
    return params.claims;
  }

  const [lineId] = lineIds;
  if (lineId == null) {
    return params.claims;
  }

  const closureDates = extractDiscreteClosureDates(
    params.evidenceText,
    params.evidenceTs,
  );
  if (closureDates.length === 0) {
    return params.claims;
  }

  const activeServiceIds = params.repo.services
    .searchByLineId(lineId)
    .filter((service) => isServiceActiveAt(service, params.evidenceTs))
    .map((service) => service.id);
  if (activeServiceIds.length === 0) {
    return params.claims;
  }

  const causes = inferClosureCauses(params.evidenceText);
  const synthesizedClaims = activeServiceIds.flatMap((serviceId) =>
    closureDates.map((startAt) => {
      const start = DateTime.fromISO(startAt, { setZone: true }).setZone(
        'Asia/Singapore',
      );
      return {
        entity: { type: 'service', serviceId },
        effect: {
          service: { kind: 'no-service' },
          facility: null,
        },
        scopes: {
          service: [{ type: 'service.whole' }],
        },
        statusSignal: 'planned',
        timeHints: {
          kind: 'fixed',
          startAt,
          endAt: toIsoOrThrow(start.plus({ days: 1 })),
        },
        causes,
      } satisfies Claim;
    }),
  );

  return dedupeClaims([...params.claims, ...synthesizedClaims]);
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

function collectMentionedLineIds(
  searchText: string,
  repo: MRTDownRepository,
): string[] {
  const normalizedSearchText = normalizeSearchText(searchText);

  return repo.lines
    .list()
    .filter((line) => {
      return (
        containsNormalizedPhrase(normalizedSearchText, line.id) ||
        containsNormalizedPhrase(normalizedSearchText, line.name['en-SG'])
      );
    })
    .map((line) => line.id);
}

function evidenceDescribesExplicitWholeLineClosure(text: string): boolean {
  return [
    /\bline will be closed on\b/i,
    /\bline will undergo a full[- ]day closure\b/i,
    /\btrain services? would be unavailable\b/i,
    /\btrain services? will be unavailable\b/i,
    /\bfull[- ]day closure\b/i,
  ].some((pattern) => pattern.test(text));
}

function extractDiscreteClosureDates(
  text: string,
  evidenceTs: string,
): string[] {
  const evidenceDateTime = DateTime.fromISO(evidenceTs).setZone('Asia/Singapore');
  if (!evidenceDateTime.isValid) {
    return [];
  }

  const dates = new Set<string>();
  const patterns = [
    /\b(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?<day>\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(?<year>\d{4}))?\b/gi,
    /\b(?<day>\d{1,2})(?:st|nd|rd|th)?\s+(?<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(?<year>\d{4}))?\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const month = match.groups?.month;
      const day = match.groups?.day;
      if (month == null || day == null) {
        continue;
      }

      const year =
        match.groups?.year == null
          ? undefined
          : Number.parseInt(match.groups.year, 10);
      const monthNumber = monthNameToNumber(month);
      if (monthNumber == null) {
        continue;
      }

      const parsed = buildClosureDateTime({
        day: Number.parseInt(day, 10),
        month: monthNumber,
        year,
        evidenceDateTime,
      });
      if (parsed != null) {
        dates.add(toIsoOrThrow(parsed));
      }
    }
  }

  return [...dates].sort();
}

function buildClosureDateTime(params: {
  day: number;
  month: number;
  year?: number;
  evidenceDateTime: DateTime;
}): DateTime | null {
  const candidateYear =
    params.year ??
    (params.month < params.evidenceDateTime.month ||
    (params.month === params.evidenceDateTime.month &&
      params.day < params.evidenceDateTime.day)
      ? params.evidenceDateTime.year + 1
      : params.evidenceDateTime.year);

  const dateTime = DateTime.fromObject(
    {
      year: candidateYear,
      month: params.month,
      day: params.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    { zone: 'Asia/Singapore' },
  );

  return dateTime.isValid ? dateTime : null;
}

function monthNameToNumber(month: string): number | null {
  const key = month.toLowerCase();
  const byMonth: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  return byMonth[key] ?? null;
}

function inferClosureCauses(evidenceText: string): Claim['causes'] {
  const haystack = evidenceText.toLowerCase();
  if (
    /\bupgrade\b/.test(haystack) ||
    /\brenewal\b/.test(haystack) ||
    /\btesting\b/.test(haystack) ||
    /\bworks\b/.test(haystack)
  ) {
    return ['system.upgrade'];
  }
  return null;
}

function isServiceActiveAt(service: Service, evidenceTs: string): boolean {
  const evidenceTsMs = Date.parse(evidenceTs);
  return service.revisions.some((revision) => {
    const startedAtMs = Date.parse(revision.startAt);
    const endedAtMs =
      revision.endAt == null ? null : Date.parse(revision.endAt);
    return startedAtMs <= evidenceTsMs && (endedAtMs == null || endedAtMs > evidenceTsMs);
  });
}

function dedupeClaims(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  const deduped: Claim[] = [];

  for (const claim of claims) {
    const key = JSON.stringify(claim);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(claim);
  }

  return deduped;
}

function toIsoOrThrow(dateTime: DateTime): string {
  const iso = dateTime
    .setZone('Asia/Singapore')
    .toISO({ includeOffset: true, suppressMilliseconds: true });
  if (iso == null) {
    throw new Error('Expected valid ISO timestamp');
  }
  return iso;
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
