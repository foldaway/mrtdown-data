import {
  proposeScheduleReconciliation,
  type ReconciliationTarget,
} from './reconciliation.js';
import { buildReconciliationEvidence } from './reconciliationEvidence.js';
import { auditSchedule } from './schedule.js';
import type { partitionScopedCandidates } from './scopedCandidates.js';
import {
  fingerprint,
  type ScopedReviewContext,
} from './scopedReviewContract.js';

export function derive(context: ScopedReviewContext) {
  const report = proposeScheduleReconciliation(
    context.tables,
    context.identity,
    context.topology,
  );
  const evidence = buildReconciliationEvidence(
    context.tables,
    context.identity,
    context.topology,
  );
  const audit = auditSchedule(context.tables);
  return { report, evidence, audit };
}
export function sameTarget(
  a: ReconciliationTarget | undefined,
  b: ReconciliationTarget | undefined,
) {
  return Boolean(a && b && fingerprint(a) === fingerprint(b));
}
export function targetOnDate(
  scopes: ReturnType<typeof partitionScopedCandidates>,
  date: string,
  target: ReconciliationTarget,
) {
  return scopes.scopes.some(
    (scope) =>
      scope.serviceDates.includes(date) &&
      scope.candidates.some((candidate) => sameTarget(candidate, target)),
  );
}

export function operatorMatchesDate(
  topology: ScopedReviewContext['topology'],
  lineId: string | undefined,
  operatorId: string | undefined,
  date: string,
) {
  return Boolean(
    operatorId &&
      topology.lines
        .find((line) => line.id === lineId)
        ?.operators.some(
          (period) =>
            period.operatorId === operatorId &&
            (!period.startedAt || date >= period.startedAt) &&
            (!period.endedAt || date < period.endedAt),
        ),
  );
}
