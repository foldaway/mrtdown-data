import { DateTime } from 'luxon';
import { FileStore } from '#repo/common/FileStore.js';
import { deriveCurrentState } from '#repo/issue/helpers/deriveCurrentState.js';
import { IssueRepository } from '#repo/issue/IssueRepository.js';
import type { Period } from '#schema/issue/period.js';
import {
  type ResolvePeriodsMode,
  resolvePeriods,
} from '../../helpers/resolvePeriods.js';

export type ShowIssueOptions = {
  dataDir: string;
  issueId: string;
  json?: boolean;
};

function formatScope(scope: {
  type: string;
  fromStationId?: string;
  toStationId?: string;
  stationId?: string;
}): string {
  switch (scope.type) {
    case 'service.whole':
      return 'whole line';
    case 'service.segment':
      return `${scope.fromStationId} → ${scope.toStationId}`;
    case 'service.point':
      return scope.stationId ?? '?';
    default:
      return JSON.stringify(scope);
  }
}

function formatEffect(
  effect: { kind: string; duration?: string | null } | null,
): string {
  if (!effect) return '—';
  if (effect.kind === 'delay') {
    return effect.duration ? `delay (${effect.duration})` : 'delay';
  }
  return effect.kind;
}

type ResolvedPeriod = {
  startAt: string;
  endAt: string | null;
  endAtResolved: string | null;
  endAtSource: 'fact' | 'inferred' | 'none';
  endAtReason?: 'crowd_decay' | 'evidence_timeout';
};

function formatPeriod(period: ResolvedPeriod): string {
  const start = period.startAt;
  const end = period.endAtResolved ?? period.endAt ?? 'ongoing';
  let suffix = '';
  if (period.endAtSource === 'inferred' && period.endAtReason) {
    suffix = ` (inferred: ${period.endAtReason})`;
  }
  return `${start} → ${end}${suffix}`;
}

const MODES = ['canonical', 'operational'] as const;

function buildResolveMode(
  mode: (typeof MODES)[number],
  evidence: { ts: string }[],
): ResolvePeriodsMode {
  switch (mode) {
    case 'canonical':
      return { kind: 'canonical' };
    case 'operational': {
      const lastEvidenceAt =
        evidence.length > 0
          ? evidence.reduce<string>(
              (latest, e) => (e.ts > latest ? e.ts : latest),
              evidence[0].ts,
            )
          : null;
      return { kind: 'operational', lastEvidenceAt };
    }
  }
}

function resolvePeriodsByMode(
  periods: Period[],
  asOf: string,
  evidence: { ts: string }[],
): Record<(typeof MODES)[number], ResolvedPeriod[]> {
  const result = {} as Record<(typeof MODES)[number], ResolvedPeriod[]>;
  for (const mode of MODES) {
    result[mode] =
      periods.length > 0
        ? resolvePeriods({
            periods,
            asOf,
            mode: buildResolveMode(mode, evidence),
          })
        : [];
  }
  return result;
}

export function runShowIssue(opts: ShowIssueOptions): number {
  const store = new FileStore(opts.dataDir);
  const repo = new IssueRepository(store);

  const bundle = repo.get(opts.issueId);
  if (!bundle) {
    console.error(`Issue not found: ${opts.issueId}`);
    return 1;
  }

  const state = deriveCurrentState(bundle);
  const asOf = DateTime.now().toISO() ?? '';

  const resolvedServices = Object.fromEntries(
    Object.entries(state.services).map(([key, svc]) => [
      key,
      {
        ...svc,
        periodsByMode: resolvePeriodsByMode(svc.periods, asOf, bundle.evidence),
      },
    ]),
  );

  const resolvedFacilities = Object.fromEntries(
    Object.entries(state.facilities).map(([key, fac]) => [
      key,
      {
        ...fac,
        periodsByMode: resolvePeriodsByMode(fac.periods, asOf, bundle.evidence),
      },
    ]),
  );

  if (opts.json) {
    const output = {
      issue: bundle.issue,
      evidenceCount: bundle.evidence.length,
      impactEventCount: bundle.impactEvents.length,
      currentState: {
        ...state,
        services: resolvedServices,
        facilities: resolvedFacilities,
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  // Human-readable output
  const { issue, evidence, impactEvents } = bundle;
  console.log(`\n${issue.title['en-SG'] ?? issue.id}`);
  console.log('─'.repeat(60));
  console.log(`ID:     ${issue.id}`);
  console.log(`Type:   ${issue.type}`);
  console.log(`Path:   ${bundle.path}`);
  console.log(`Evidence: ${evidence.length} item(s)`);
  console.log(`Impact:  ${impactEvents.length} event(s)`);
  console.log('');

  const hasServices = Object.keys(resolvedServices).length > 0;
  const hasFacilities = Object.keys(resolvedFacilities).length > 0;

  if (hasServices) {
    console.log('Current state — Services');
    console.log('─'.repeat(40));
    for (const [, svc] of Object.entries(resolvedServices)) {
      console.log(`  ${svc.serviceId}`);
      console.log(`    effect:  ${formatEffect(svc.effect)}`);
      if (svc.scopes.length > 0) {
        console.log(`    scopes:  ${svc.scopes.map(formatScope).join('; ')}`);
      }
      for (const mode of MODES) {
        const periods = svc.periodsByMode[mode];
        if (periods.length > 0) {
          console.log(
            `    periods (${mode}): ${periods.map(formatPeriod).join('; ')}`,
          );
        }
      }
      if (svc.causes.length > 0) {
        console.log(`    causes:  ${svc.causes.join(', ')}`);
      }
      console.log('');
    }
  }

  if (hasFacilities) {
    console.log('Current state — Facilities');
    console.log('─'.repeat(40));
    for (const [, fac] of Object.entries(resolvedFacilities)) {
      console.log(`  ${fac.stationId} (${fac.kind})`);
      console.log(`    effect:  ${formatEffect(fac.effect)}`);
      for (const mode of MODES) {
        const periods = fac.periodsByMode[mode];
        if (periods.length > 0) {
          console.log(
            `    periods (${mode}): ${periods.map(formatPeriod).join('; ')}`,
          );
        }
      }
      if (fac.causes.length > 0) {
        console.log(`    causes:  ${fac.causes.join(', ')}`);
      }
      console.log('');
    }
  }

  if (!hasServices && !hasFacilities) {
    console.log('Current state: (no services or facilities affected)');
  }

  return 0;
}
