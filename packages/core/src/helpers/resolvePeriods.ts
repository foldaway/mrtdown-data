import { DateTime } from 'luxon';
import z from 'zod';
import type { Period, PeriodFixed } from '../schema/issue/period.js';
import { assert } from '../util/assert.js';
import { normalizeRecurringPeriod } from './normalizeRecurringPeriod.js';

export const ResolvePeriodsModeKindSchema = z.enum([
  'canonical',
  'operational',
]);
export type ResolvePeriodsModeKind = z.infer<
  typeof ResolvePeriodsModeKindSchema
>;

const DEFAULTS: ResolvePeriodsOperationalModeConfig = {
  evidenceStaleAfterMinutes: 120,
  crowdExitGraceMinutes: 30,
  maxInferredDurationMinutes: 18 * 60,
};

/**
 * Optional inference tuning for operational mode.
 */
type ResolvePeriodsOperationalModeConfig = {
  /**
   * Minutes after `lastEvidenceAt` before an open period is considered stale.
   *
   * @default 120
   */
  evidenceStaleAfterMinutes?: number;
  /**
   * Grace minutes after crowd activity decays before inferring resolution.
   *
   * @default 30
   */
  crowdExitGraceMinutes?: number;
  /**
   * Hard cap for inferred period length from `startAt`.
   *
   * @default 1080
   */
  maxInferredDurationMinutes?: number;
};

/**
 * Crowd-derived signal used as a positive indicator of ongoing disruption.
 */
type ResolvePeriodsCrowdSignal = {
  /**
   * Whether crowd reports currently indicate active disruption.
   */
  activeNow: boolean;
  /**
   * Most recent timestamp when crowd activity was observed.
   */
  lastActiveAt?: string | null;
  /**
   * Explicit timestamp when crowd reports indicate resolution.
   */
  exitedAt?: string | null;
  /**
   * Optional model confidence for `activeNow` in the [0, 1] range.
   */
  confidenceNow?: number | null;
};

export type ResolvePeriodsMode =
  | { kind: Extract<ResolvePeriodsModeKind, 'canonical'> }
  | {
      kind: Extract<ResolvePeriodsModeKind, 'operational'>;
      /**
       * Timestamp of the most recent evidence supporting an ongoing state
       * for this entity.
       *
       * If provided and endAt is null:
       * - May be used to infer an end time after a configured staleness window.
       *
       * If null or undefined:
       * - No evidence-timeout inference will occur.
       */
      lastEvidenceAt?: string | null;
      /**
       * Optional crowd signal state for this entity.
       *
       * Crowd data is treated as a positive signal:
       * - activeNow = true -> disruption likely ongoing.
       * - exitedAt or lastActiveAt may be used to infer resolution.
       */
      crowd?: ResolvePeriodsCrowdSignal | null;
      /**
       * Optional configuration overrides for inference behavior.
       *
       * If omitted, sensible defaults are used.
       *
       * @default { evidenceStaleAfterMinutes: 120, crowdExitGraceMinutes: 30, maxInferredDurationMinutes: 1080 }
       */
      config?: ResolvePeriodsOperationalModeConfig;
    };

export const ResolvePeriodsEndAtSourceSchema = z.enum([
  'fact',
  'inferred',
  'none',
]);
export type ResolvePeriodsEndAtSource = z.infer<
  typeof ResolvePeriodsEndAtSourceSchema
>;
export const ResolvePeriodsEndAtReasonSchema = z.enum([
  'crowd_decay',
  'evidence_timeout',
]);
export type ResolvePeriodsEndAtReason = z.infer<
  typeof ResolvePeriodsEndAtReasonSchema
>;

/**
 * Parameters for resolvePeriods().
 *
 * These inputs provide:
 * - The canonical periods to resolve
 * - The evaluation timestamp (`asOf`)
 * - The normalization strategy (`mode`)
 * - Optional contextual signals used for inference (evidence + crowd)
 *
 * None of these inputs modify canonical storage. They are used only to
 * derive a view suitable for UI or analytics.
 */
export type ResolvePeriodsParams = {
  /**
   * Canonical periods for a single entity (service or facility).
   *
   * Requirements:
   * - startAt and endAt must be ISO 8601 strings with timezone offsets.
   * - endAt may be null when resolution was not explicitly recorded.
   *
   * These are treated as factual inputs. resolvePeriods() does not
   * mutate or rewrite them.
   */
  periods: Period[];

  /**
   * The timestamp at which normalization is evaluated.
   *
   * Must be an ISO 8601 string with timezone offset (e.g. +08:00).
   *
   * Examples:
   * - Determines whether a period is currently active.
   * - Prevents inferred end times from extending into the future.
   */
  asOf: string;

  /**
   * Controls how open-ended periods are interpreted.
   */
  mode: ResolvePeriodsMode;
};

/**
 * Normalized periods returned by `resolvePeriods()`.
 *
 * Each item preserves canonical `startAt`/`endAt` values and adds mode-aware
 * resolution metadata for consumers that need either factual timelines or
 * operational "active now" behavior.
 */
type ResolvePeriodsResult = {
  /**
   * Start timestamp from canonical period data.
   */
  startAt: string;
  /**
   * Canonical end timestamp as stored in source data.
   *
   * This remains null for open-ended canonical periods.
   */
  endAt: string | null;
  /**
   * Effective end timestamp for the selected mode.
   *
   * - "canonical": equals `endAt`
   * - "operational": may be inferred (end of day when inferred)
   */
  endAtResolved: string | null;
  /**
   * Origin of `endAtResolved`.
   */
  endAtSource: ResolvePeriodsEndAtSource;
  /**
   * Heuristic used when `endAtSource` is "inferred".
   */
  endAtReason?: ResolvePeriodsEndAtReason;
}[];

function resolveByMode(args: {
  period: PeriodFixed;
  mode: ResolvePeriodsMode['kind'];
  asOf: DateTime;
  lastEvidenceAt?: string | null;
  crowd?: ResolvePeriodsCrowdSignal | null;
  config: ResolvePeriodsOperationalModeConfig;
}): ResolvePeriodsResult[number] {
  const { period, mode, asOf, lastEvidenceAt, crowd, config } = args;
  const startAtDt = DateTime.fromISO(period.startAt, { setZone: true });
  assert(startAtDt.isValid, `Invalid ISO datetime: ${period.startAt}`);

  if (mode === 'canonical') {
    return {
      ...period,
      endAtResolved: period.endAt,
      endAtSource: period.endAt ? 'fact' : 'none',
    };
  }

  if (period.endAt) {
    return {
      ...period,
      endAtResolved: period.endAt,
      endAtSource: 'fact',
    };
  }

  const evidenceTimeoutEnd = lastEvidenceAt
    ? (() => {
        const parsedLastEvidenceAt = DateTime.fromISO(lastEvidenceAt, {
          setZone: true,
        });
        assert(
          parsedLastEvidenceAt.isValid,
          `Invalid ISO datetime: ${lastEvidenceAt}`,
        );
        return parsedLastEvidenceAt.plus({
          minutes: config.evidenceStaleAfterMinutes,
        });
      })()
    : null;

  let crowdDecayEnd: DateTime | null = null;
  if (crowd) {
    if (crowd.exitedAt) {
      crowdDecayEnd = DateTime.fromISO(crowd.exitedAt, { setZone: true });
      assert(crowdDecayEnd.isValid, `Invalid ISO datetime: ${crowd.exitedAt}`);
    } else if (!crowd.activeNow && crowd.lastActiveAt) {
      const parsedLastActiveAt = DateTime.fromISO(crowd.lastActiveAt, {
        setZone: true,
      });
      assert(
        parsedLastActiveAt.isValid,
        `Invalid ISO datetime: ${crowd.lastActiveAt}`,
      );
      crowdDecayEnd = parsedLastActiveAt.plus({
        minutes: config.crowdExitGraceMinutes,
      });
    }
  }

  const inferredCandidate = crowdDecayEnd ?? evidenceTimeoutEnd;
  const inferredReason: ResolvePeriodsResult[number]['endAtReason'] =
    crowdDecayEnd
      ? 'crowd_decay'
      : evidenceTimeoutEnd
        ? 'evidence_timeout'
        : undefined;

  if (!inferredCandidate || !inferredReason) {
    return {
      ...period,
      endAtResolved: null,
      endAtSource: 'none',
    };
  }

  const maxInferredEnd = startAtDt.plus({
    minutes: config.maxInferredDurationMinutes,
  });

  // Inferred end = end of day (00:00 next day, exclusive) in Singapore timezone.
  let inferredEnd = inferredCandidate
    .setZone('Asia/Singapore')
    .startOf('day')
    .plus({ days: 1 });

  // Never infer an end before the period starts.
  if (inferredEnd < startAtDt) {
    inferredEnd = startAtDt;
  }
  // Never infer beyond the configured operational maximum window.
  if (inferredEnd > maxInferredEnd) {
    inferredEnd = maxInferredEnd;
  }

  // If inferred close time is in the future relative to asOf, keep it open.
  if (inferredEnd > asOf) {
    return {
      ...period,
      endAtResolved: null,
      endAtSource: 'none',
    };
  }

  return {
    ...period,
    endAtResolved: inferredEnd.toISO(),
    endAtSource: 'inferred',
    endAtReason: inferredReason,
  };
}

/**
 * Resolves canonical Period[] into a view suitable for UI or statistics.
 *
 * This function does NOT mutate canonical period data. It derives a view over
 * stored periods depending on the selected normalization mode.
 *
 * The core problem this solves:
 * - In real operations, disruption "end" is often not explicitly reported.
 * - Crowd reports are positive-only (people report problems more than resolution).
 * - Canonical logs should not fabricate timestamps, but the product still needs:
 *   - a usable "active now" experience, and
 *   - honest uptime/statistics.
 *
 * ---------------------------------------------------------------------
 * MODES
 * ---------------------------------------------------------------------
 *
 * 1) "canonical"  (truth / audit)
 *
 * Intended for:
 * - Issue detail timelines and audit views ("what do we actually know?")
 * - Debugging and deterministic replay
 * - Data exports and downstream processing
 *
 * Behavior:
 * - Returns periods exactly as stored.
 * - endAtresolved === endAt.
 * - Open-ended periods (endAt = null) remain open.
 * - No inferred end times are introduced.
 *
 * Use this when you want maximum factual integrity and reproducibility.
 *
 *
 * 2) "operational"  (live UX)
 *
 * Intended for:
 * - Live disruption UI (homepage banners, "active now", notifications)
 * - User-facing duration display ("likely ended around ...")
 * - Operational dashboards where preventing "zombie incidents" is important
 *
 * Behavior:
 * - If a period has a factual endAt, use it.
 * - If endAt is null, attempt to infer an end time using heuristics such as:
 *   - crowd signal decay (preferred when available)
 *   - evidence staleness timeout (fallback)
 * - Inferred ends are annotated:
 *   endAtSource = "inferred"
 *   endAtReason = "crowd_decay" | "evidence_timeout"
 * - If inference would produce an end time later than `asOf`,
 *   the period remains open (still active).
 *
 * IMPORTANT:
 * - Inferred ends are derived and reversible.
 * - They must NOT be written back into canonical storage.
 *
 * Inferred ends are set to end of day (00:00 next day, exclusive) in Singapore
 * timezone, not duration-based. This avoids artificially shortening disruption.
 *
 * Use this when you want a stable, user-friendly view of "what's happening now"
 * even when reporting is incomplete.
 *
 *
 * ---------------------------------------------------------------------
 * DESIGN PRINCIPLE
 * ---------------------------------------------------------------------
 *
 * Canonical data must remain factually correct and append-only.
 * Heuristics (timeouts, crowd decay, assumptions) belong in derived views,
 * not in canonical period storage.
 */
export function resolvePeriods(
  params: ResolvePeriodsParams,
): ResolvePeriodsResult {
  const { periods, asOf, mode } = params;
  const lastEvidenceAt =
    mode.kind === 'operational' ? mode.lastEvidenceAt : undefined;
  const crowd = mode.kind === 'operational' ? (mode.crowd ?? null) : null;
  const config = mode.kind === 'operational' ? mode.config : undefined;

  const normalizedPeriods = periods.flatMap((period) => {
    switch (period.kind) {
      case 'fixed':
        return [period];
      case 'recurring':
        return normalizeRecurringPeriod(period);
      default:
        // @ts-expect-error - we only support fixed and recurring periods for now
        throw new Error(`Invalid period kind: ${period.kind}`);
    }
  });

  const effectiveConfig = {
    evidenceStaleAfterMinutes:
      config?.evidenceStaleAfterMinutes ?? DEFAULTS.evidenceStaleAfterMinutes,
    crowdExitGraceMinutes:
      config?.crowdExitGraceMinutes ?? DEFAULTS.crowdExitGraceMinutes,
    maxInferredDurationMinutes:
      config?.maxInferredDurationMinutes ?? DEFAULTS.maxInferredDurationMinutes,
  };
  const asOfDt = DateTime.fromISO(asOf, { setZone: true });
  assert(asOfDt.isValid, `Invalid ISO datetime: ${asOf}`);
  const sorted = [...normalizedPeriods].sort((a, b) => {
    const aStart = DateTime.fromISO(a.startAt, { setZone: true });
    const bStart = DateTime.fromISO(b.startAt, { setZone: true });
    assert(aStart.isValid, `Invalid ISO datetime: ${a.startAt}`);
    assert(bStart.isValid, `Invalid ISO datetime: ${b.startAt}`);
    return aStart.toMillis() - bStart.toMillis();
  });

  return sorted.map((period) =>
    resolveByMode({
      period: { ...period },
      mode: mode.kind,
      asOf: asOfDt,
      lastEvidenceAt,
      crowd,
      config: effectiveConfig,
    }),
  );
}
