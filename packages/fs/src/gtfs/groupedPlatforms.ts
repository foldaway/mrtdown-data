import z from 'zod';
import { compareStrings } from './order.js';
import type { ReconciliationTarget } from './reconciliation.js';
import type { buildReconciliationEvidence } from './reconciliationEvidence.js';
import { sameTarget } from './scopedReviewContext.js';
import type { ScopedReviewContext } from './scopedReviewContract.js';
import { resolveStationCandidates } from './stationMatch.js';

export const PlatformGroupTargetSchema = z
  .object({
    kind: z.literal('platformGroup'),
    stationId: z.string().min(1),
    lineId: z.string().min(1),
    platformIds: z
      .array(z.string().min(1))
      .min(2)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Platform group members must be unique',
      })
      .transform((ids) => [...ids].sort(compareStrings)),
  })
  .strict();

export type PlatformGroupTarget = z.infer<typeof PlatformGroupTargetSchema>;

/** Preserve a complete literal provider set without selecting an allocation. */
export function derivePlatformGroup(
  context: ScopedReviewContext,
  providerId: string,
): PlatformGroupTarget | undefined {
  const stops = context.tables['stops.txt'] ?? [];
  const rows = stops.filter((row) => row.stop_id === providerId);
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !row ||
    (row.location_type && row.location_type !== '0') ||
    !row.stop_code
  )
    return undefined;
  const labels = (row.platform_code ?? '')
    .split('/')
    .map((label) => label.trim());
  if (
    labels.length < 2 ||
    labels.some((label) => !label) ||
    new Set(labels).size !== labels.length
  )
    return undefined;
  const parents = row.parent_station
    ? stops.filter((parent) => parent.stop_id === row.parent_station)
    : [];
  if (row.parent_station && parents.length !== 1) return undefined;
  const matches = resolveStationCandidates(
    row,
    parents[0],
    context.topology.stations,
  );
  const station = matches[0]?.station;
  if (matches.length !== 1 || !station) return undefined;
  const lineIds = new Set(
    station.stationCodes
      .filter((code) => code.code === row.stop_code)
      .map((code) => code.lineId),
  );
  const lineId = [...lineIds][0];
  if (lineIds.size !== 1 || !lineId) return undefined;
  const platformIds: string[] = [];
  for (const label of labels) {
    const platforms = station.platforms.filter(
      (platform) => platform.lineId === lineId && platform.label === label,
    );
    const platform = platforms[0];
    if (platforms.length !== 1 || !platform) return undefined;
    platformIds.push(platform.id);
  }
  const result = PlatformGroupTargetSchema.safeParse({
    kind: 'platformGroup',
    stationId: station.id,
    lineId,
    platformIds,
  });
  return result.success ? result.data : undefined;
}

/** All alternatives must pass current diagnostics; callers still gate dates. */
export function groupedPlatformDiagnosticsAllow(
  facts: ReturnType<typeof buildReconciliationEvidence>['patterns'][number],
  target: ReconciliationTarget,
  groups: ReadonlyMap<string, PlatformGroupTarget>,
): boolean {
  if (!groups.size) return true;
  const candidate = facts.candidates.find((item) =>
    sameTarget(item.target, target),
  );
  if (!candidate) return false;
  return candidate.occurrences.every((occurrence) => {
    const group = groups.get(occurrence.stopId);
    if (!group) return true;
    return group.platformIds.every((id) => {
      const platform = occurrence.platforms.find(
        (option) => option.platformId === id,
      );
      return Boolean(
        platform &&
          platform.serviceScope !== 'excluded' &&
          platform.boardingStatus !== 'not_in_service' &&
          !(
            platform.boardingStatus === 'alighting_only' &&
            occurrence.index < facts.stopIds.length - 1 &&
            occurrence.pickupDropOff.some(
              (restriction) => restriction.pickup !== '1',
            )
          ),
      );
    });
  });
}
