import { compareStrings } from './order.js';
import type { ReconciliationTarget } from './reconciliation.js';

export interface ScopedCandidate {
  target: ReconciliationTarget;
  serviceDates: readonly string[];
}
function civilDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  )
    throw new Error(`Invalid scoped service date: ${value}`);
  return timestamp;
}
function exclusiveEnd(value: string) {
  const end = new Date(civilDate(value) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  civilDate(end);
  return end;
}
function targetKey(target: ReconciliationTarget) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(target)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => compareStrings(a, b)),
    ),
  );
}

/** Partition exact active dates by all eligible targets. Never select or approve one. */
export function partitionScopedCandidates(
  activeServiceDates: readonly string[],
  input: readonly ScopedCandidate[],
) {
  const activeDates = [...activeServiceDates].sort(compareStrings);
  if (new Set(activeDates).size !== activeDates.length)
    throw new Error('Duplicate active service date');
  for (const date of activeDates) civilDate(date);
  const active = new Set(activeDates);
  const targets = new Map<string, ReconciliationTarget>();
  const datesByTarget = new Map<string, Set<string>>();
  for (const candidate of input) {
    const key = targetKey(candidate.target);
    if (targets.has(key)) throw new Error('Duplicate scoped candidate target');
    targets.set(key, JSON.parse(key) as ReconciliationTarget);
    const dates = new Set(candidate.serviceDates);
    if (dates.size !== candidate.serviceDates.length)
      throw new Error('Duplicate candidate service date');
    for (const date of dates) {
      civilDate(date);
      if (!active.has(date))
        throw new Error(
          `Candidate date is outside the active calendar: ${date}`,
        );
    }
    datesByTarget.set(key, dates);
  }
  const sortedTargets = [...targets].sort(([a], [b]) => compareStrings(a, b));
  const groups: {
    key: string;
    serviceDates: string[];
    candidates: ReconciliationTarget[];
  }[] = [];
  for (const date of activeDates) {
    const eligible = sortedTargets.filter(([key]) =>
      datesByTarget.get(key)?.has(date),
    );
    const key = JSON.stringify(eligible.map(([key]) => key));
    const previous = groups.at(-1);
    if (previous?.key === key) previous.serviceDates.push(date);
    else
      groups.push({
        key,
        serviceDates: [date],
        candidates: eligible.map(([, target]) => target),
      });
  }
  const scopes = groups.map(({ serviceDates, candidates }) => {
    const first = serviceDates[0];
    const last = serviceDates.at(-1);
    if (!first || !last) throw new Error('Empty service-date scope');
    return {
      startDate: first,
      endDateExclusive: exclusiveEnd(last),
      serviceDates,
      candidates,
      status:
        candidates.length === 0
          ? ('gap' as const)
          : candidates.length === 1
            ? ('unique' as const)
            : ('ambiguous' as const),
    };
  });
  const count = (status: (typeof scopes)[number]['status']) =>
    scopes
      .filter((scope) => scope.status === status)
      .reduce((total, scope) => total + scope.serviceDates.length, 0);
  return {
    schemaVersion: 1 as const,
    activeDateCount: activeDates.length,
    uniqueDateCount: count('unique'),
    ambiguousDateCount: count('ambiguous'),
    uncoveredDateCount: count('gap'),
    scopes,
    generationEligible: false as const,
  };
}
